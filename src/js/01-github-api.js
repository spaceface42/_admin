/* ---------- GitHub API client ---------- */
// Depends on state/Store/Paths/LastWriteCommitCache from 00-core.js
// and GitHubApiUtils from 00-api-utils.js.

const GitHubApi = Object.freeze({
  repoPath(path=''){
    return GitHubApiUtils.repoPath({owner:state.owner,repo:state.repo,path});
  },
  async request(path,{method='GET',body,raw=false}={}){
    // Keep the request CORS-simple enough for local file:// usage.
    // Content freshness is handled by the content-tree/blob read model,
    // not by custom no-cache headers.
    const res=await fetch(API+path,{
      method,
      headers:GitHubApiUtils.requestHeaders({token:state.token,hasBody:!!body}),
      body:GitHubApiUtils.requestBody(body)
    });
    if(!res.ok){
      let detail=''; try{detail=(await res.json()).message||'';}catch(e){}
      const err=new Error(detail||res.statusText); err.status=res.status; throw err;
    }
    if(raw) return res;
    if(res.status===204) return null;
    const text=await res.text();
    return text ? JSON.parse(text) : null;
  },
  getRepo(){
    return this.request(this.repoPath());
  },
  getBranch(branch){
    return this.request(this.repoPath(GitHubApiUtils.branchPath(branch)));
  },
  getRef(branch){
    return this.request(this.repoPath(GitHubApiUtils.refPath(branch)));
  },
  async createRef(branch,sha){
    return this.request(this.repoPath('/git/refs'),{
      method:'POST',
      body:GitHubApiUtils.createRefBody({branch,sha})
    });
  },
  createBranchFromSha(branch,sha){
    return this.createRef(branch,sha);
  },
  async updateRef(branch,sha,{force=false}={}){
    const out=await this.request(this.repoPath(GitHubApiUtils.updateRefPath(branch)),{
      method:'PATCH',
      body:GitHubApiUtils.updateRefBody({sha,force})
    });
    LastWriteCommitCache.set(branch,sha);
    return out;
  },
  async contentReadRef(ref){
    if(ref && (ref===state.workBranch || ref===state.defaultBranch || ref===LEGACY_WORK_BRANCH)){
      try{
        const branchRef=await this.getRef(ref);
        return branchRef && branchRef.object && branchRef.object.sha ? branchRef.object.sha : ref;
      }catch(e){
        return ref;
      }
    }
    return ref;
  },
  async getContent(path,ref){
    const readRef=await this.contentReadRef(ref);
    return this.request(this.repoPath(GitHubApiUtils.contentsPath({path,ref:readRef,githubPath:Paths.githubPath})));
  },
  getContentForWrite(path,branch){
    // Write-source read:
    // Use the actual CMS work branch name directly and bypass the content-tree
    // cache/pinned preview read path. This returns the SHA expected by the
    // GitHub Contents PUT endpoint.
    return this.request(this.repoPath(GitHubApiUtils.contentsPath({path,ref:branch,githubPath:Paths.githubPath})));
  },
  getFileForWrite(path,branch){
    return this.getContentForWrite(path,branch);
  },
  getGitCommit(sha){
    return this.request(this.repoPath(GitHubApiUtils.commitPath(sha)));
  },
  getTreeBySha(treeSha,{recursive=false}={}){
    return this.request(this.repoPath(GitHubApiUtils.treePath(treeSha,{recursive})));
  },
  getBlob(sha){
    return this.request(this.repoPath(GitHubApiUtils.blobPath(sha)));
  },
  async resolveBranchCommitForRead(branch,{preferLastWrite=true}={}){
    const ref=await this.getRef(branch);
    const branchSha=ref && ref.object ? ref.object.sha : '';

    if(!branchSha) throw new Error(`Could not resolve ${branch} branch SHA.`);

    const cachedSha=preferLastWrite && branch===state.workBranch
      ? LastWriteCommitCache.get(branch)
      : '';

    if(!cachedSha || cachedSha===branchSha){
      return {
        commitSha:branchSha,
        source:cachedSha ? 'branch ref + cached write' : 'branch ref'
      };
    }

    // The local write cache exists to avoid GitHub branch-ref lag immediately
    // after Save → content. But if the real content branch moved on later, that
    // cached SHA becomes stale and must not override the branch.
    //
    // Compare branchSha...cachedSha:
    // - ahead_by > 0 means cachedSha contains commits not visible at branchSha,
    //   so the cache is newer and should be used.
    // - ahead_by === 0, behind, or compare failure means branch ref wins.
    try{
      const cmp=await this.compare(branchSha,cachedSha);
      if(cmp && typeof cmp.ahead_by==='number' && cmp.ahead_by>0){
        return {commitSha:cachedSha,source:'last successful write'};
      }
    }catch(e){
      console.warn('Could not validate cached content SHA; using branch ref',e);
    }

    LastWriteCommitCache.clear(branch);
    return {commitSha:branchSha,source:'branch ref'};
  },

  async getBranchTreeSnapshot(branch,{force=false,preferLastWrite=true}={}){
    if(!force && state.contentTree && state.contentTree.branch===branch){
      return state.contentTree;
    }

    // Resolve content source carefully:
    // Prefer a pinned write SHA only if it is validated as newer than the
    // current branch ref. Otherwise a stale browser cache could load old content.
    const resolved=await this.resolveBranchCommitForRead(branch,{preferLastWrite});
    const commitSha=resolved.commitSha;
    const source=resolved.source;

    const commit=await this.getGitCommit(commitSha);
    const treeSha=commit.tree.sha;
    const tree=await this.getTreeBySha(treeSha,{recursive:true});
    const snapshot=ContentSourceUtils.buildContentTreeSnapshot({
      branch,
      commitSha,
      treeSha,
      source,
      treeResponse:tree
    });
    Store.setContentTree(snapshot);
    return snapshot;
  },
  async getBlobFileFromSnapshot(path,snapshot){
    const cleanPath=Paths.normalizeRepoPath(path);
    const item=ContentSourceUtils.findBlobInTree(snapshot.tree,cleanPath);
    if(!item){
      const err=new Error('File not found');
      err.status=404;
      throw err;
    }
    const blob=await this.getBlob(item.sha);
    return {
      path:cleanPath,
      sha:item.sha,
      type:'file',
      encoding:blob.encoding || 'base64',
      content:ContentSourceUtils.normalizeBlobContent(blob.content)
    };
  },
  async getFileViaGitData(path,ref){
    // Content tree model:
    // For the CMS work branch, read from a single resolved tree snapshot.
    // `main` is deploy-only and should not be used as an editable source.
    if(ref===state.workBranch){
      const snapshot=await this.getBranchTreeSnapshot(state.workBranch);
      return this.getBlobFileFromSnapshot(path,snapshot);
    }

    const readRef=await this.contentReadRef(ref);
    const commit=await this.getGitCommit(readRef);
    const tree=await this.getTreeBySha(commit.tree.sha,{recursive:true});
    return this.getBlobFileFromSnapshot(path,ContentSourceUtils.buildContentTreeSnapshot({
      branch:ref,
      commitSha:readRef,
      treeSha:commit.tree.sha,
      source:'branch ref',
      treeResponse:tree
    }));
  },
  getFile(path,ref){
    return this.getFileViaGitData(path,ref);
  },
  listContent(path,ref){
    // Directory listings still use the contents API.
    return this.getContent(path,ref);
  },
  putContent(path,body){
    return this.request(this.repoPath(GitHubApiUtils.contentsPath({path,githubPath:Paths.githubPath})),{method:'PUT',body});
  },
  async saveFile(path,{message,content,branch,sha}){
    const out=await this.putContent(path,{message,content,branch,...(sha?{sha}:{})});
    if(out && out.commit && out.commit.sha) LastWriteCommitCache.set(branch,out.commit.sha);
    return out;
  },
  deleteContent(path,body){
    return this.request(this.repoPath(GitHubApiUtils.contentsPath({path,githubPath:Paths.githubPath})),{method:'DELETE',body});
  },
  async deleteFile(path,{message,sha,branch}){
    const out=await this.deleteContent(path,{message,sha,branch});
    if(out && out.commit && out.commit.sha) LastWriteCommitCache.set(branch,out.commit.sha);
    return out;
  },
  async merge(base,head,commit_message){
    const out=await this.request(this.repoPath(GitHubApiUtils.mergePath()),{method:'POST',body:GitHubApiUtils.mergeBody({base,head,commit_message})});
    if(out && out.sha) LastWriteCommitCache.set(base,out.sha);
    return out;
  },
  compare(base,head){
    return this.request(this.repoPath(GitHubApiUtils.comparePath({base,head})));
  },
  tree(ref){
    return this.request(this.repoPath(GitHubApiUtils.treePath(ref,{recursive:true})));
  },
  getRecursiveTree(ref){
    return this.tree(ref);
  },
  pages(){
    return this.request(this.repoPath(GitHubApiUtils.pagesPath()));
  },
  getPagesInfo(){
    return this.pages();
  }
});

// Compatibility wrapper. New code should prefer GitHubApi.request().
async function gh(path,opts={}){
  return GitHubApi.request(path,opts);
}

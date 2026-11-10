# _admin CMS

Static single-page CMS for `_blackhole`. Runs identically on localhost and GitHub Pages.

## 1. Create a Fine-Grained Personal Access Token
1. In GitHub, go to **Settings -> Developer settings -> Personal access tokens -> Fine-grained tokens**.
2. Click **Generate new token**.
3. Under **Repository access**, choose **Only select repositories** and select `_blackhole`.
4. Under **Repository permissions**, set **Contents** to **Read and write**.
5. Generate and copy the token.

## 2. Configure `config.json`
Update `config.json` with your GitHub username and deployed `_blackhole` GitHub Pages URL.

## 3. Run Locally with One Command
From inside the `_admin` folder, run either:
`python3 -m http.server 8080` or `npx serve .`

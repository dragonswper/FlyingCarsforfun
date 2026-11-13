# Git and GitHub

This project already has Git history and the remote **https://github.com/dragonswper/FlyingCarsforfun.git** on branch **main**. Do not reinitialize it or replace its history. `.gitignore` excludes dependencies, logs, environment files, TLS keys/certificates and common secret directories. GitHub Actions checks syntax and runs the test suite on pushes/pull requests.

To work in a new checkout:

```sh
git clone https://github.com/dragonswper/FlyingCarsforfun.git
cd FlyingCarsforfun
npm ci --ignore-scripts
git switch -c my-change
# edit files
npm run check
npm test
git diff
git add <the-files-you-changed>
git commit -m "Describe the change"
git push -u origin my-change
```

If you independently copied the files into a **new directory that has no Git history**, connect that copy to your own new empty repository as follows. Do not run this in the established project checkout:

```sh
git init -b main
git add .
git commit -m "Initial game source"
git remote add origin https://github.com/YOUR-ACCOUNT/YOUR-REPO.git
git push -u origin main
```

Use `git remote -v` to inspect an existing connection before adding another. Never place an access token in a remote URL. Authenticate through GitHub's normal account/credential flow. Keep deployment credentials in the provider's secret settings and TLS keys outside the checkout; review staged files with `git diff --cached` before committing.

The canonical GitHub repository and the hosted Site's separate source service are distinct. GitHub saving does not by itself publish the existing Site; that requires its supported source/version/deployment workflow. A free Render deployment uses the canonical GitHub source through the supplied Blueprint. It can serve the updated game directly even if an older Site deployment remains live.

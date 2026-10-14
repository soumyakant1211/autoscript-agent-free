# One-time setup

The two GitHub workflow files live here because they can't be written into `.github/` remotely.
Copy them into place once (run in the project folder):

    mkdir .github\workflows 2>nul & copy /Y setup\github-workflows\*.yml .github\workflows\

PowerShell: `New-Item -ItemType Directory -Force .github\workflows; Copy-Item setup\github-workflows\*.yml .github\workflows\ -Force`

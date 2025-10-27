# Resolving Merge Conflicts for the Horror Prototype

This guide walks you through recreating the "Load FBX monster archive and rebuild horror maze" changes and handling conflicts that may appear when you open a new pull request.

## 1. Reapply the last modification set
1. Check out a fresh branch based on the target branch (usually `main`).
   ```bash
   git checkout main
   git pull
   git checkout -b horror-maze-refresh
   ```
2. Apply the patch that contains all files from the last PR attempt:
   ```bash
   git apply docs/last_modifications.patch
   ```
   If you prefer reviewing each hunk interactively, use `git apply --reject --whitespace=fix` and fix any `.rej` files manually.

The patch was generated from commit `0f4989e` and recreates:
- asset loading updates (`index.html`, `js/main.js`, `styles.css`)
- documentation edits (`README.md`, `assets/README.md`)
- dependency updates (`package.json`, `package-lock.json`)
- the `.gitignore` refresh

## 2. Handle conflicts while applying the patch
If `git apply` or later `git merge` reports conflicts:

1. Open each conflicted file and decide whether to keep the patch version, the current branch version, or a combination. Use conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`) as guides.
2. Remove the conflict markers after you pick the desired content.
3. Stage the resolved files:
   ```bash
   git add <file>
   ```
4. Verify all conflicts are resolved:
   ```bash
   git status
   ```

## 3. Commit and push
Once everything looks correct:
```bash
git commit -m "Reapply horror maze prototype"
git push -u origin horror-maze-refresh
```

Finally, open a new pull request from `horror-maze-refresh`. If GitHub still reports conflicts, click **Resolve conflicts**, apply the same decisions in the web editor, and commit the resolution.

## 4. Need to regenerate the patch?
If you want to recreate the patch directly from the commits:
```bash
git diff 8faf183 0f4989e > docs/last_modifications.patch
```
This command assumes the same commit history is available locally.

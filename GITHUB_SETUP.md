# Setting Up Your Email Tracker Repository on GitHub

This guide will help you connect your local Email Tracker repository to GitHub and manage it effectively.

## Prerequisites

- A GitHub account
- Git installed on your computer (already done)
- Your Email Tracker project files (already set up)

## Steps to Connect to GitHub

### 1. Create a New Repository on GitHub

1. Go to [GitHub](https://github.com/) and sign in to your account
2. Click the '+' icon in the top-right corner and select 'New repository'
3. Name your repository (e.g., "email-tracker")
4. Add a description (optional)
5. Choose whether to make it public or private
6. Do NOT initialize with a README, .gitignore, or license as we already have these files
7. Click 'Create repository'

### 2. Connect Your Local Repository to GitHub

After creating your GitHub repository, you'll see instructions. Follow these commands in your terminal:

```bash
# Configure Git with your GitHub username and email if not already done
git config --global user.name "Your GitHub Username"
git config --global user.email "your.email@example.com"

# Add the GitHub repository as a remote
git remote add origin https://github.com/YOUR-USERNAME/email-tracker.git

# Push your code to GitHub
git push -u origin master
```

Replace `YOUR-USERNAME` with your actual GitHub username and `email-tracker` with your repository name if different.

## Managing Your Repository

### Pushing Changes

After making changes to your code:

```bash
git add .
git commit -m "Description of changes"
git push
```

### Pulling Changes

If you've made changes on GitHub or another computer:

```bash
git pull
```

## Best Practices

1. **Commit Often**: Make small, focused commits with clear messages
2. **Use Branches**: Create branches for new features or bug fixes
3. **Write Good Commit Messages**: Be descriptive about what changes you made
4. **Keep Your Repository Clean**: Use the .gitignore file to exclude unnecessary files

## Troubleshooting

### Authentication Issues

If you encounter authentication issues, GitHub now recommends using a personal access token instead of a password:

1. Go to GitHub → Settings → Developer settings → Personal access tokens
2. Generate a new token with appropriate permissions
3. Use this token instead of your password when prompted

### Other Issues

For other Git or GitHub issues, refer to the [GitHub documentation](https://docs.github.com/) or [Git documentation](https://git-scm.com/doc).
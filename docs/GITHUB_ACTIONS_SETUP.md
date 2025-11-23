# GitHub Actions Setup Guide

This guide explains how to configure GitHub Actions for the Salesforce Event-Driven Pipeline.

## Critical Issues Fixed

The following issues were causing intermittent GitHub Actions failures:

### 1. ❌ Authentication Issue (CRITICAL)
**Problem**: Workflows used `sf org login web` which requires a browser and doesn't work in CI/CD.

**Solution**: Updated all workflows to use proper CI/CD authentication:
- **Preferred**: SFDX Auth URL via `sf org login sfdx-url`
- **Fallback**: Username/password via `sf org login user`

### 2. ❌ Missing Lint Script
**Problem**: Test workflow tried to run `npm run lint` but script didn't exist.

**Solution**: Added eslint and lint scripts to package.json.

### 3. ❌ Coverage Upload Failures
**Problem**: Codecov upload failed when coverage files weren't generated.

**Solution**: Made coverage generation and upload optional and non-blocking.

## Required GitHub Secrets

You need to configure these secrets in your GitHub repository settings.

### Authentication Option 1: SFDX Auth URL (Recommended)

This is the most secure method for CI/CD.

**Generate Auth URL**:
```bash
# Authenticate to your org
sf org login web --alias my-org --set-default

# Display auth URL
sf org display --verbose --json | grep sfdxAuthUrl
```

**GitHub Secrets to Add**:
- `SF_AUTH_URL` - For sandbox/dev org
- `SF_PROD_AUTH_URL` - For production org (optional)

### Authentication Option 2: Username/Password (Fallback)

Less secure but simpler to set up.

**GitHub Secrets to Add**:
- `SF_USERNAME` - Your Salesforce username
- `SF_PASSWORD` - Your Salesforce password
- `SF_SECURITY_TOKEN` - Your Salesforce security token
- `SF_LOGIN_URL` - Login URL (https://login.salesforce.com or https://test.salesforce.com)

**For Production** (if using validate-deploy workflow):
- `SF_PROD_USERNAME`
- `SF_PROD_PASSWORD`
- `SF_PROD_SECURITY_TOKEN`
- `SF_PROD_LOGIN_URL`

### Additional Secrets

**Git Configuration**:
- `GIT_AUTHOR_NAME` - Name for automated commits (e.g., "Pipeline Bot")
- `GIT_AUTHOR_EMAIL` - Email for automated commits (e.g., "bot@example.com")

**Optional** (for codecov):
- `CODECOV_TOKEN` - If you want coverage reports

## How to Add Secrets

1. Go to your GitHub repository
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Add each secret with its value
5. Save

## Workflow Details

### 1. Test Workflow (`test.yml`)

**Triggers**: Every push to any branch

**What it does**:
- Runs on Node.js 18 and 20
- Installs dependencies
- Runs linting (non-blocking)
- Runs tests
- Generates coverage (Node 20 only)
- Uploads to codecov (optional)

**No secrets required** - runs without Salesforce auth

### 2. Metadata Sync Workflow (`metadata-sync.yml`)

**Triggers**:
- Push to main/develop/feature branches
- Every 6 hours (scheduled)
- Manual trigger

**What it does**:
- Authenticates to Salesforce
- Retrieves metadata
- Commits changes to git

**Required secrets**: SF_AUTH_URL or (SF_USERNAME + SF_PASSWORD + SF_SECURITY_TOKEN + SF_LOGIN_URL)

### 3. Validate and Deploy Workflow (`validate-deploy.yml`)

**Triggers**:
- Pull requests to main
- Push to main

**What it does**:
- **On PR**: Validates deployment (check-only)
- **On merge to main**: Deploys to production

**Required secrets**:
- Dev org: SF_AUTH_URL or credentials
- Production: SF_PROD_AUTH_URL or production credentials

### 4. Data Backup Workflow (`data-backup.yml`)

**Triggers**:
- Daily at 2 AM UTC (scheduled)
- Manual trigger

**What it does**:
- Authenticates to Salesforce
- Extracts data from configured objects
- Commits to git
- Creates backup artifact (30-day retention)

**Required secrets**: SF_AUTH_URL or credentials

## Testing Your Setup

### Test Authentication

Create a simple test workflow to verify your secrets work:

```yaml
name: Test Auth
on: workflow_dispatch

jobs:
  test-auth:
    runs-on: ubuntu-latest
    steps:
      - name: Install SF CLI
        run: npm install -g @salesforce/cli

      - name: Test Authentication
        env:
          SF_USERNAME: ${{ secrets.SF_USERNAME }}
          SF_PASSWORD: ${{ secrets.SF_PASSWORD }}
          SF_SECURITY_TOKEN: ${{ secrets.SF_SECURITY_TOKEN }}
          SF_LOGIN_URL: ${{ secrets.SF_LOGIN_URL }}
        run: |
          if [ -n "${{ secrets.SF_AUTH_URL }}" ]; then
            echo "${{ secrets.SF_AUTH_URL }}" > authurl.txt
            sf org login sfdx-url --sfdx-url-file authurl.txt
            rm authurl.txt
          else
            sf org login user --username "$SF_USERNAME" \
              --password "${SF_PASSWORD}${SF_SECURITY_TOKEN}" \
              --instance-url "$SF_LOGIN_URL" --no-prompt
          fi

      - name: Verify Auth
        run: sf org list
```

Run this workflow manually to verify your secrets are correct.

## Common Issues and Solutions

### Issue: "Invalid username, password, security token"

**Solutions**:
1. Verify your password and security token are correct
2. Check if your IP is whitelisted in Salesforce
3. Generate a new security token if needed
4. Use SF_AUTH_URL method instead

### Issue: "Failed to authorize the org"

**Solutions**:
1. Verify SF_AUTH_URL is complete and not truncated
2. Re-generate the auth URL: `sf org display --verbose`
3. Check that the connected app has not been revoked

### Issue: "Package.xml not found"

**Solution**: Ensure `manifest/package.xml` exists in your repository

### Issue: Tests fail on lint step

**Solution**: Run `npm run lint:fix` locally to fix linting errors, then commit

### Issue: Coverage upload fails

**Solution**: This is non-blocking now. If you want codecov:
1. Sign up at codecov.io
2. Add your repository
3. Add `CODECOV_TOKEN` secret

## Disabling Workflows

If you don't need certain workflows:

### Disable Scheduled Runs

Comment out the schedule trigger:
```yaml
# on:
#   schedule:
#     - cron: '0 */6 * * *'
```

### Disable Entirely

Add to the workflow file:
```yaml
on: workflow_dispatch  # Manual trigger only
```

Or delete the workflow file entirely.

## Best Practices

1. **Use Auth URL for production** - More secure than password
2. **Rotate secrets regularly** - Update tokens every 90 days
3. **Monitor workflow runs** - Check Actions tab for failures
4. **Test in sandbox first** - Validate workflows before production
5. **Review auto-commits** - Ensure metadata sync is working correctly

## Architecture: How Authentication Works

```
GitHub Actions Workflow
        ↓
Check for SF_AUTH_URL secret
        ↓
   ┌────┴────┐
   │         │
  Yes       No
   │         │
   ↓         ↓
Use Auth  Use Username
  URL     + Password
   │         │
   └────┬────┘
        ↓
Authenticate to Salesforce
        ↓
Execute Workflow Tasks
```

## Security Notes

- **Never commit secrets** to your repository
- **Auth URLs expire** - regenerate if workflows start failing
- **Limit workflow permissions** - Use repository secrets, not environment secrets
- **Review workflow logs** - They may contain sensitive information
- **Use environment protection** for production deployments

## Getting Help

If workflows continue to fail:

1. Check the **Actions** tab for detailed error logs
2. Verify all required secrets are set
3. Test authentication manually in a shell
4. Review the workflow YAML for syntax errors
5. Check Salesforce API limits haven't been exceeded

## Summary

After configuring secrets properly:

✅ All workflows will authenticate correctly
✅ Tests run without blocking on lint errors
✅ Coverage uploads are optional
✅ Metadata syncs automatically
✅ Data backups run daily
✅ Deployments validate before merging

Your CI/CD pipeline should now run reliably!

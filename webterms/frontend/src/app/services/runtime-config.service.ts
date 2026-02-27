import { Injectable } from '@angular/core';

export interface GithubRepoConfig {
  owner: string;
  repo: string;
  branch: string;
  documentsRootPath: string;
  manifestPath: string;
  publicBaseUrl: string;
}

@Injectable({ providedIn: 'root' })
export class RuntimeConfigService {
  private static readonly MANIFEST_URL_KEY = 'webterms_manifest_url';
  private static readonly GITHUB_TOKEN_KEY = 'webterms_github_token';
  private static readonly GITHUB_REPO_CONFIG_KEY = 'webterms_github_repo_config';

  private static readonly DEFAULT_MANIFEST_URL =
    'https://raw.githubusercontent.com/dedandy/cima-legal-public-docs/main/legal-docs/manifests/latest.json';

  private static readonly DEFAULT_REPO_CONFIG: GithubRepoConfig = {
    owner: 'CIMAFoundation',
    repo: 'cima-legal-public-docs',
    branch: 'main',
    documentsRootPath: 'legal-docs/files',
    manifestPath: 'legal-docs/manifests/latest.json',
    publicBaseUrl: 'https://raw.githubusercontent.com/dedandy/cima-legal-public-docs/main'
  };

  getManifestUrl(): string {
    return localStorage.getItem(RuntimeConfigService.MANIFEST_URL_KEY) || RuntimeConfigService.DEFAULT_MANIFEST_URL;
  }

  setManifestUrl(url: string): void {
    localStorage.setItem(RuntimeConfigService.MANIFEST_URL_KEY, url.trim());
  }

  getGithubToken(): string {
    return localStorage.getItem(RuntimeConfigService.GITHUB_TOKEN_KEY) || '';
  }

  setGithubToken(token: string): void {
    localStorage.setItem(RuntimeConfigService.GITHUB_TOKEN_KEY, token.trim());
  }

  clearGithubToken(): void {
    localStorage.removeItem(RuntimeConfigService.GITHUB_TOKEN_KEY);
  }

  getGithubRepoConfig(): GithubRepoConfig {
    const raw = localStorage.getItem(RuntimeConfigService.GITHUB_REPO_CONFIG_KEY);
    if (!raw) {
      return RuntimeConfigService.DEFAULT_REPO_CONFIG;
    }

    try {
      const parsed = JSON.parse(raw) as Partial<GithubRepoConfig>;
      return {
        owner: parsed.owner || RuntimeConfigService.DEFAULT_REPO_CONFIG.owner,
        repo: parsed.repo || RuntimeConfigService.DEFAULT_REPO_CONFIG.repo,
        branch: parsed.branch || RuntimeConfigService.DEFAULT_REPO_CONFIG.branch,
        documentsRootPath:
          parsed.documentsRootPath || RuntimeConfigService.DEFAULT_REPO_CONFIG.documentsRootPath,
        manifestPath: parsed.manifestPath || RuntimeConfigService.DEFAULT_REPO_CONFIG.manifestPath,
        publicBaseUrl: parsed.publicBaseUrl || RuntimeConfigService.DEFAULT_REPO_CONFIG.publicBaseUrl
      };
    } catch {
      return RuntimeConfigService.DEFAULT_REPO_CONFIG;
    }
  }

  setGithubRepoConfig(config: GithubRepoConfig): void {
    localStorage.setItem(RuntimeConfigService.GITHUB_REPO_CONFIG_KEY, JSON.stringify(config));
  }
}

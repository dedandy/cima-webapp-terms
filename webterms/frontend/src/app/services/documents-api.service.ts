import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom, map, Observable } from 'rxjs';
import {
  DocumentDto,
  DocumentsResponse,
  PublicLatestEntry,
  PublicLatestResponse,
  PublishPayload
} from './api.models';

interface GithubContentResponse {
  sha: string;
}

interface GithubGetFileResponse {
  sha: string;
}

@Injectable({ providedIn: 'root' })
export class DocumentsApiService {
  private readonly http = inject(HttpClient);

  getDocuments(
    manifestUrl: string,
    filters: {
      search?: string;
      platform?: string;
      docType?: string;
      lang?: string;
    }
  ): Observable<DocumentsResponse> {
    return this.getPublicLatest(manifestUrl).pipe(
      map((response) => {
        const documents = this.flattenLatest(response.latest || {});
        return {
          documents: documents.filter((doc) => {
            if (filters.search) {
              const search = filters.search.toLowerCase();
              const haystack = `${doc.originalFileName} ${doc.downloadFileName} ${doc.platform} ${doc.docType}`
                .toLowerCase();
              if (!haystack.includes(search)) return false;
            }
            if (filters.platform && doc.platform !== filters.platform) return false;
            if (filters.docType && doc.docType !== filters.docType) return false;
            if (filters.lang && doc.lang !== filters.lang) return false;
            return true;
          })
        };
      })
    );
  }

  getPublicLatest(manifestUrl: string): Observable<PublicLatestResponse> {
    return this.http.get<PublicLatestResponse>(manifestUrl);
  }

  async publishDocument(payload: PublishPayload): Promise<{ version: number; filePath: string }> {
    const dateFolder = payload.effectiveDate;
    const safeName = payload.fileName.replace(/[^a-zA-Z0-9_.-]/g, '_');
    const manifest = await this.fetchManifest(payload);

    const currentVersion =
      manifest.latest?.[payload.platform]?.[payload.docType]?.[payload.lang]?.version ?? 0;
    const nextVersion = currentVersion + 1;
    const versionTag = `v${String(nextVersion).padStart(3, '0')}`;

    const filePath = `${payload.documentsRootPath}/${payload.platform}/${payload.docType}/${payload.lang}/${dateFolder}/${versionTag}_${safeName}`;
    const downloadUrl = `${payload.publicBaseUrl}/${filePath}`;

    const sha256 = await this.computeSha256(payload.contentBase64);
    const entry: PublicLatestEntry = {
      id: `${payload.platform}-${payload.docType}-${payload.lang}-${versionTag}`,
      line: payload.line || '-',
      version: nextVersion,
      effectiveDate: payload.effectiveDate,
      sha256,
      url: downloadUrl,
      downloadUrl,
      originalFileName: payload.fileName,
      downloadFileName: `${payload.platform}_${payload.docType}_${payload.lang}_${versionTag}_${safeName}`
    };

    const nextManifest: PublicLatestResponse = {
      latest: {
        ...(manifest.latest || {}),
        [payload.platform]: {
          ...(manifest.latest?.[payload.platform] || {}),
          [payload.docType]: {
            ...(manifest.latest?.[payload.platform]?.[payload.docType] || {}),
            [payload.lang]: entry
          }
        }
      }
    };

    await this.upsertGithubFile({
      owner: payload.repoOwner,
      repo: payload.repoName,
      branch: payload.branch,
      path: filePath,
      contentBase64: payload.contentBase64,
      message: `docs: publish ${payload.platform}/${payload.docType}/${payload.lang} ${versionTag}`,
      token: payload.githubToken
    });

    await this.upsertGithubFile({
      owner: payload.repoOwner,
      repo: payload.repoName,
      branch: payload.branch,
      path: payload.manifestPath,
      contentBase64: this.encodeUtf8ToBase64(JSON.stringify(nextManifest, null, 2) + '\n'),
      message: `docs: update manifest ${payload.platform}/${payload.docType}/${payload.lang} ${versionTag}`,
      token: payload.githubToken
    });

    return { version: nextVersion, filePath };
  }

  private async fetchManifest(payload: PublishPayload): Promise<PublicLatestResponse> {
    const githubApiPath = `https://api.github.com/repos/${payload.repoOwner}/${payload.repoName}/contents/${payload.manifestPath}?ref=${payload.branch}`;
    const headers = new HttpHeaders({ Authorization: `Bearer ${payload.githubToken}` });

    try {
      const response = await firstValueFrom(this.http.get<any>(githubApiPath, { headers }));
      const raw = atob(String(response.content || '').replace(/\n/g, ''));
      return JSON.parse(raw) as PublicLatestResponse;
    } catch {
      return { latest: {} };
    }
  }

  private flattenLatest(latest: PublicLatestResponse['latest']): DocumentDto[] {
    const flattened: DocumentDto[] = [];

    for (const platform of Object.keys(latest || {})) {
      const byType = latest[platform] || {};
      for (const docType of Object.keys(byType)) {
        const byLang = byType[docType] || {};
        for (const lang of Object.keys(byLang)) {
          const entry = byLang[lang] as PublicLatestEntry;
          flattened.push({
            id: entry.id,
            downloadFileName: entry.downloadFileName || entry.id,
            originalFileName: entry.originalFileName || entry.id,
            line: entry.line,
            sha256: entry.sha256,
            platform,
            docType: docType as DocumentDto['docType'],
            lang,
            effectiveDate: entry.effectiveDate,
            version: entry.version,
            deletedAt: null,
            downloadUrl: entry.downloadUrl,
            publicUrl: entry.url
          });
        }
      }
    }

    return flattened.sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate));
  }

  private async upsertGithubFile(params: {
    owner: string;
    repo: string;
    branch: string;
    path: string;
    contentBase64: string;
    message: string;
    token: string;
  }): Promise<GithubContentResponse> {
    const url = `https://api.github.com/repos/${params.owner}/${params.repo}/contents/${params.path}`;
    const headers = new HttpHeaders({
      Authorization: `Bearer ${params.token}`,
      Accept: 'application/vnd.github+json'
    });

    let sha: string | undefined;
    try {
      const existing = await firstValueFrom(
        this.http.get<GithubGetFileResponse>(`${url}?ref=${params.branch}`, { headers })
      );
      sha = existing.sha;
    } catch {
      sha = undefined;
    }

    return await firstValueFrom(
      this.http.put<GithubContentResponse>(
        url,
        {
          message: params.message,
          content: params.contentBase64,
          branch: params.branch,
          sha
        },
        { headers }
      )
    );
  }

  private async computeSha256(contentBase64: string): Promise<string> {
    const binary = atob(contentBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const view = new Uint8Array(digest);
    return Array.from(view)
      .map((value) => value.toString(16).padStart(2, '0'))
      .join('');
  }

  private encodeUtf8ToBase64(value: string): string {
    const bytes = new TextEncoder().encode(value);
    let binary = '';
    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }
    return btoa(binary);
  }
}

import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { DocumentsResponse, PublicLatestResponse } from './api.models';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class DocumentsApiService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly apiBaseUrl = 'api';

  getDocuments(filters: {
    search?: string;
    platform?: string;
    docType?: string;
    lang?: string;
    includeDeleted?: boolean;
  }): Observable<DocumentsResponse> {
    let params = new HttpParams();
    if (filters.search) params = params.set('search', filters.search);
    if (filters.platform) params = params.set('platform', filters.platform);
    if (filters.docType) params = params.set('docType', filters.docType);
    if (filters.lang) params = params.set('lang', filters.lang);
    if (filters.includeDeleted) params = params.set('includeDeleted', 'true');
    return this.http.get<DocumentsResponse>(`${this.apiBaseUrl}/documents`, { params });
  }

  uploadDocument(payload: Record<string, unknown>): Observable<unknown> {
    return this.http.post(`${this.apiBaseUrl}/documents/upload`, payload, {
      headers: this.auth.buildAuthHeaders()
    });
  }

  softDelete(documentId: string): Observable<unknown> {
    return this.http.delete(`${this.apiBaseUrl}/documents/${documentId}`, {
      headers: this.auth.buildAuthHeaders()
    });
  }

  getPublicLatest(): Observable<PublicLatestResponse> {
    return this.http.get<PublicLatestResponse>(`${this.apiBaseUrl}/public/latest.json`);
  }
}

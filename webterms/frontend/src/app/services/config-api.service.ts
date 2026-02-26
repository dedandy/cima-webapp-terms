import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { InfraConfigResponse } from './api.models';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class ConfigApiService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly apiBaseUrl = 'api';

  getInfraConfig(): Observable<InfraConfigResponse> {
    return this.http.get<InfraConfigResponse>(`${this.apiBaseUrl}/mockup/config`, {
      headers: this.auth.buildAuthHeaders()
    });
  }
}

import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { LoginResponse, MeResponse } from './api.models';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class AuthApiService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly apiBaseUrl = 'api';

  login(username: string, password: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.apiBaseUrl}/mockup/login`, { username, password });
  }

  getMe(): Observable<MeResponse> {
    return this.http.get<MeResponse>(`${this.apiBaseUrl}/mockup/me`, {
      headers: this.auth.buildAuthHeaders()
    });
  }
}

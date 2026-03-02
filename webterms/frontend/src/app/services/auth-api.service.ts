import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { map } from 'rxjs/operators';
import { catchError } from 'rxjs/operators';
import { LoginResponse, MeResponse } from './api.models';

@Injectable({ providedIn: 'root' })
export class AuthApiService {
  private readonly http = inject(HttpClient);
  private readonly infraApiBaseUrl = 'https://mockup.cimafoundation.org/infrastruttura/api/';

  login(username: string, password: string): Observable<LoginResponse> {
    return this.http
      .post<{ success?: boolean; id?: number; username?: string; role?: string; message?: string }>(
        `${this.infraApiBaseUrl}auth.php`,
        { username, password }
      )
      .pipe(
        map((response) => {
          if (response?.success) {
            return {
              // auth.php does not return bearer token; keep a synthetic session token in FE.
              token: `infra-${response.id || 0}-${response.username || username}`,
              user: {
                id: response.id,
                username: response.username || username,
                role: response.role
              },
              source: 'infrastruttura-api'
            } satisfies LoginResponse;
          }

          return {
            token: '',
            source: 'infrastruttura-api'
          } satisfies LoginResponse;
        }),
        catchError(() =>
          of({
            token: '',
            source: 'infrastruttura-api'
          })
        )
      );
  }

  getMe(): Observable<MeResponse> {
    return this.http.get<MeResponse>(`${this.infraApiBaseUrl}auth.php`).pipe(
      catchError(() => of({ user: { username: 'local-user' } }))
    );
  }
}

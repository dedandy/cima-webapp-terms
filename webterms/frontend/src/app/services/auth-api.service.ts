import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { LoginResponse, MeResponse } from './api.models';

@Injectable({ providedIn: 'root' })
export class AuthApiService {
  login(username: string, _password: string): Observable<LoginResponse> {
    return of({
      token: `local-${username || 'user'}-token`,
      user: { username: username || 'local-user' },
      source: 'local-fallback'
    });
  }

  getMe(): Observable<MeResponse> {
    return of({ user: { username: 'local-user' } });
  }
}

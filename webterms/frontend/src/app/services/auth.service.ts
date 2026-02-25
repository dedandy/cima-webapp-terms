import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private static readonly TOKEN_KEY = 'webterms_token';

  getToken(): string {
    return localStorage.getItem(AuthService.TOKEN_KEY) || '';
  }

  setToken(token: string): void {
    localStorage.setItem(AuthService.TOKEN_KEY, token);
  }

  clearToken(): void {
    localStorage.removeItem(AuthService.TOKEN_KEY);
  }

  isAuthenticated(): boolean {
    return Boolean(this.getToken());
  }
}

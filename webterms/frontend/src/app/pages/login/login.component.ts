import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthApiService } from '../../services/auth-api.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent {
  private readonly api = inject(AuthApiService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  username = '';
  password = '';
  error = false;

  async login(): Promise<void> {
    this.error = false;
    try {
      const response = await firstValueFrom(this.api.login(this.username, this.password));
      if (!response?.token) {
        this.showError();
        return;
      }
      this.auth.setToken(response.token);
      this.router.navigate(['/upload']);
    } catch {
      this.showError();
    }
  }

  private showError(): void {
    this.error = true;
    setTimeout(() => {
      this.error = false;
    }, 3000);
  }
}

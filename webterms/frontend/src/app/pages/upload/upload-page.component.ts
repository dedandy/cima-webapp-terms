import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { PlatformOption } from '../../services/api.models';
import { AuthService } from '../../services/auth.service';
import { ConfigApiService } from '../../services/config-api.service';
import { DocumentsApiService } from '../../services/documents-api.service';

@Component({
  selector: 'app-upload-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './upload-page.component.html',
  styleUrl: './upload-page.component.scss'
})
export class UploadPageComponent {
  private readonly configApi = inject(ConfigApiService);
  private readonly documentsApi = inject(DocumentsApiService);
  private readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);

  readonly uploadForm = this.fb.group({
    platform: ['', Validators.required],
    line: this.fb.control({ value: '', disabled: true }),
    docType: ['terms', Validators.required],
    lang: ['it', Validators.required],
    effectiveDate: ['', Validators.required]
  });

  queuedFiles: File[] = [];
  uploadMessage = '';
  loading = false;
  dragActive = false;
  platformOptions: PlatformOption[] = [];
  lineOptions: string[] = [];
  langOptions = ['it', 'en', 'fr', 'es', 'pt'];

  constructor() {
    if (!this.auth.isAuthenticated()) {
      this.router.navigate(['/login']);
      return;
    }
    this.loadConfig();
  }

  onPickFiles(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.mergeFiles(input.files);
    input.value = '';
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragActive = false;
    this.mergeFiles(event.dataTransfer?.files ?? null);
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragActive = true;
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.dragActive = false;
  }

  removeQueued(index: number): void {
    this.queuedFiles = this.queuedFiles.filter((_, idx) => idx !== index);
  }

  async uploadAll(): Promise<void> {
    if (!this.queuedFiles.length || this.uploadForm.invalid) {
      this.uploadMessage = 'Compila i campi e aggiungi almeno un file.';
      return;
    }

    this.loading = true;
    const formValue = this.uploadForm.getRawValue();
    const results: string[] = [];

    for (const file of this.queuedFiles) {
      try {
        const payload = {
          ...formValue,
          fileName: file.name,
          mimeType: file.type || 'application/octet-stream',
          contentBase64: await this.readFileAsBase64(file)
        };
        await firstValueFrom(this.documentsApi.uploadDocument(payload));
        results.push(`OK: ${file.name}`);
      } catch (error: any) {
        if (error?.status === 401) {
          this.auth.clearToken();
          this.uploadMessage = 'Sessione scaduta o non valida. Effettua di nuovo il login.';
          this.router.navigate(['/login']);
          this.loading = false;
          return;
        }
        const duplicateId = error?.error?.duplicateDocumentId;
        const backendError = String(error?.error?.error || '').trim();
        if (duplicateId) {
          results.push(`DUP: ${file.name} (id ${duplicateId})`);
        } else if (backendError) {
          results.push(`ERR: ${file.name} (${backendError})`);
        } else {
          results.push(`ERR: ${file.name} (status ${error?.status || 'unknown'})`);
        }
      }
    }

    this.uploadMessage = results.join(' | ');
    this.queuedFiles = [];
    this.loading = false;
  }

  private async loadConfig(): Promise<void> {
    try {
      const cfg = await firstValueFrom(this.configApi.getInfraConfig());
      this.platformOptions = cfg.platforms || [];
      this.lineOptions = cfg.lines || [];
      if (this.lineOptions.length) {
        this.uploadForm.controls.line.enable({ emitEvent: false });
      } else {
        this.uploadForm.controls.line.disable({ emitEvent: false });
      }
      this.langOptions = cfg.languages?.length ? cfg.languages : this.langOptions;
      const firstPlatform = this.platformOptions[0]?.id || '';
      this.uploadForm.patchValue({ platform: firstPlatform });
    } catch {
      this.platformOptions = [];
      this.lineOptions = [];
      this.uploadForm.controls.line.disable({ emitEvent: false });
      this.uploadForm.patchValue({ platform: '' });
    }
  }

  private mergeFiles(files: FileList | null): void {
    if (!files?.length) return;
    const existing = new Set(this.queuedFiles.map((f) => `${f.name}:${f.size}`));
    for (const file of Array.from(files)) {
      const key = `${file.name}:${file.size}`;
      if (!existing.has(key)) this.queuedFiles.push(file);
    }
  }

  private readFileAsBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? '').split(',')[1] ?? '');
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }
}

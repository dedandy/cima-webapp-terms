import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { PlatformOption } from '../../services/api.models';

@Component({
  selector: 'app-upload-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './upload-page.component.html',
  styleUrl: './upload-page.component.scss'
})
export class UploadPageComponent {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);

  readonly uploadForm = this.fb.group({
    platform: ['', Validators.required],
    line: [''],
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
        await firstValueFrom(this.api.uploadDocument(payload));
        results.push(`OK: ${file.name}`);
      } catch (error: any) {
        const duplicateId = error?.error?.duplicateDocumentId;
        results.push(duplicateId ? `DUP: ${file.name} (id ${duplicateId})` : `ERR: ${file.name}`);
      }
    }

    this.uploadMessage = results.join(' | ');
    this.queuedFiles = [];
    this.loading = false;
  }

  private async loadConfig(): Promise<void> {
    try {
      const cfg = await firstValueFrom(this.api.getInfraConfig());
      this.platformOptions = cfg.platforms || [];
      this.lineOptions = cfg.lines || [];
      this.langOptions = cfg.languages?.length ? cfg.languages : this.langOptions;
      const firstPlatform = this.platformOptions[0]?.id || 'bricks-dev';
      this.uploadForm.patchValue({ platform: firstPlatform });
    } catch {
      this.platformOptions = [{ id: 'bricks-dev', label: 'bricks-dev' }];
      this.uploadForm.patchValue({ platform: 'bricks-dev' });
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

import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { PlatformOption } from '../../services/api.models';
import { AuthService } from '../../services/auth.service';
import { ConfigApiService } from '../../services/config-api.service';
import { DocumentsApiService } from '../../services/documents-api.service';
import { RuntimeConfigService } from '../../services/runtime-config.service';

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
  private readonly runtimeConfig = inject(RuntimeConfigService);

  readonly uploadForm = this.fb.group({
    platform: ['', Validators.required],
    line: this.fb.control({ value: '', disabled: true }),
    docType: this.fb.control<'terms' | 'privacy' | 'cookie'>('terms', Validators.required),
    lang: ['it', Validators.required],
    effectiveDate: ['', Validators.required]
  });

  readonly githubForm = this.fb.group({
    manifestUrl: [this.runtimeConfig.getManifestUrl(), Validators.required],
    githubToken: [this.runtimeConfig.getGithubToken(), Validators.required],
    repoOwner: [this.runtimeConfig.getGithubRepoConfig().owner, Validators.required],
    repoName: [this.runtimeConfig.getGithubRepoConfig().repo, Validators.required],
    branch: [this.runtimeConfig.getGithubRepoConfig().branch, Validators.required],
    documentsRootPath: [this.runtimeConfig.getGithubRepoConfig().documentsRootPath, Validators.required],
    manifestPath: [this.runtimeConfig.getGithubRepoConfig().manifestPath, Validators.required],
    publicBaseUrl: [this.runtimeConfig.getGithubRepoConfig().publicBaseUrl, Validators.required]
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

  saveGithubSettings(): void {
    const cfg = this.githubForm.getRawValue();
    this.runtimeConfig.setManifestUrl(String(cfg.manifestUrl || ''));
    this.runtimeConfig.setGithubToken(String(cfg.githubToken || ''));
    this.runtimeConfig.setGithubRepoConfig({
      owner: String(cfg.repoOwner || ''),
      repo: String(cfg.repoName || ''),
      branch: String(cfg.branch || ''),
      documentsRootPath: String(cfg.documentsRootPath || ''),
      manifestPath: String(cfg.manifestPath || ''),
      publicBaseUrl: String(cfg.publicBaseUrl || '')
    });
    this.uploadMessage = 'Configurazione GitHub salvata.';
  }

  removeQueued(index: number): void {
    this.queuedFiles = this.queuedFiles.filter((_, idx) => idx !== index);
  }

  async uploadAll(): Promise<void> {
    if (!this.queuedFiles.length || this.uploadForm.invalid || this.githubForm.invalid) {
      this.uploadMessage = 'Compila i campi e aggiungi almeno un file.';
      return;
    }

    this.saveGithubSettings();
    this.loading = true;
    const formValue = this.uploadForm.getRawValue();
    const github = this.githubForm.getRawValue();
    const results: string[] = [];

    for (const file of this.queuedFiles) {
      try {
        const payload = {
          platform: String(formValue.platform || ''),
          line: String(formValue.line || ''),
          docType: formValue.docType || 'terms',
          lang: String(formValue.lang || 'it'),
          effectiveDate: String(formValue.effectiveDate || ''),
          fileName: file.name,
          contentBase64: await this.readFileAsBase64(file),
          githubToken: String(github.githubToken || ''),
          repoOwner: String(github.repoOwner || ''),
          repoName: String(github.repoName || ''),
          branch: String(github.branch || ''),
          documentsRootPath: String(github.documentsRootPath || ''),
          manifestPath: String(github.manifestPath || ''),
          publicBaseUrl: String(github.publicBaseUrl || '')
        };
        const published = await this.documentsApi.publishDocument(payload);
        results.push(`OK: ${file.name} (v${String(published.version).padStart(3, '0')})`);
      } catch (error: any) {
        const backendError = String(error?.error?.message || error?.error || '').trim();
        if (backendError) {
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

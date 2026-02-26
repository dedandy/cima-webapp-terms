import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { DocumentsListComponent } from '../../components/documents-list/documents-list.component';
import { DocumentDto, PlatformOption } from '../../services/api.models';
import { AuthService } from '../../services/auth.service';
import { ConfigApiService } from '../../services/config-api.service';
import { DocumentsApiService } from '../../services/documents-api.service';

@Component({
  selector: 'app-documents-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, DocumentsListComponent],
  templateUrl: './documents-page.component.html'
})
export class DocumentsPageComponent {
  private readonly configApi = inject(ConfigApiService);
  private readonly documentsApi = inject(DocumentsApiService);
  private readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder);

  readonly filterForm = this.fb.group({
    search: [''],
    platform: [''],
    docType: [''],
    lang: [''],
    includeDeleted: [false]
  });

  documents: DocumentDto[] = [];
  platforms: PlatformOption[] = [];
  languages = ['it', 'en', 'fr', 'es', 'pt'];

  constructor() {
    this.loadConfig();
    this.loadDocuments();
    this.filterForm.valueChanges.subscribe(() => this.loadDocuments());
  }

  async onDelete(documentId: string): Promise<void> {
    if (!this.auth.isAuthenticated()) {
      return;
    }
    await firstValueFrom(this.documentsApi.softDelete(documentId));
    await this.loadDocuments();
  }

  isAuthenticated(): boolean {
    return this.auth.isAuthenticated();
  }

  private async loadConfig(): Promise<void> {
    try {
      const cfg = await firstValueFrom(this.configApi.getInfraConfig());
      this.platforms = cfg.platforms || [];
      this.languages = cfg.languages?.length ? cfg.languages : this.languages;
    } catch {
      this.platforms = [];
    }
  }

  private async loadDocuments(): Promise<void> {
    const formValue = this.filterForm.getRawValue();
    const response = await firstValueFrom(
      this.documentsApi.getDocuments({
        search: formValue.search || undefined,
        platform: formValue.platform || undefined,
        docType: formValue.docType || undefined,
        lang: formValue.lang || undefined,
        includeDeleted: Boolean(formValue.includeDeleted)
      })
    );
    this.documents = response.documents || [];
  }
}

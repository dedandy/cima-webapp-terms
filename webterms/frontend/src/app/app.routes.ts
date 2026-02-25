import { Routes } from '@angular/router';
import { DocumentsPageComponent } from './pages/documents/documents-page.component';
import { LoginComponent } from './pages/login/login.component';
import { OfficialDocumentsPageComponent } from './pages/official/official-documents-page.component';
import { UploadPageComponent } from './pages/upload/upload-page.component';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'documents' },
  { path: 'login', component: LoginComponent },
  { path: 'documents', component: DocumentsPageComponent },
  { path: 'official-documents', component: OfficialDocumentsPageComponent },
  { path: 'upload', component: UploadPageComponent },
  { path: '**', redirectTo: 'documents' }
];

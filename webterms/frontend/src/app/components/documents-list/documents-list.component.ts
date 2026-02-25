import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { DocumentDto } from '../../services/api.models';

@Component({
  selector: 'app-documents-list',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './documents-list.component.html'
})
export class DocumentsListComponent {
  @Input() documents: DocumentDto[] = [];
  @Input() canDelete = false;
  @Output() deleteRequested = new EventEmitter<string>();

  trackById(_: number, item: DocumentDto): string {
    return item.id;
  }

  protected readonly String = String;
}

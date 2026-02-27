import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { InfraConfigResponse } from './api.models';

@Injectable({ providedIn: 'root' })
export class ConfigApiService {
  getInfraConfig(): Observable<InfraConfigResponse> {
    return of({
      lines: ['default'],
      platforms: [
        { id: 'mydewetra-italy', label: 'mydewetra-italy' },
        { id: 'bricks-dev', label: 'bricks-dev' },
        { id: 'sample-app', label: 'sample-app' }
      ],
      languages: ['it', 'en', 'fr', 'es', 'pt'],
      source: 'local-fallback'
    });
  }
}

import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { map } from 'rxjs/operators';
import { InfraConfigResponse } from './api.models';

@Injectable({ providedIn: 'root' })
export class ConfigApiService {
  private readonly http = inject(HttpClient);
  private readonly infraApiBaseUrl = 'https://mockup.cimafoundation.org/infrastruttura/api';

  getInfraConfig(): Observable<InfraConfigResponse> {
    return this.http
      .get<any[]>(`${this.infraApiBaseUrl}/getPortalsData.php`)
      .pipe(
        map((payload) => this.mapInfraPayload(payload)),
        catchError(() =>
          of({
            lines: [],
            platforms: [
              { id: 'mydewetra-italy', label: 'mydewetra-italy' },
              { id: 'bricks-dev', label: 'bricks-dev' },
              { id: 'sample-app', label: 'sample-app' }
            ],
            languages: ['it', 'en', 'fr', 'es', 'pt'],
            source: 'local-fallback'
          })
        )
      );
  }

  private mapInfraPayload(payload: any[]): InfraConfigResponse {
    const lines: string[] = [];
    const allowedLineIds = new Set([1, 2]);
    const excludedConfigurationIds = new Set(['world-training']);
    const configurations: Array<{ id: string; label: string }> = [];

    for (const group of payload || []) {
      const lineId = Number(group?.id);
      if (!allowedLineIds.has(lineId)) continue;

      lines.push(String(lineId));

      for (const installation of group?.installations || []) {
        for (const configuration of installation?.configurations || []) {
          const title = String(configuration?.title || '').trim();
          if (!title) continue;

          const id = this.slugify(title);
          if (!id || excludedConfigurationIds.has(id)) continue;

          configurations.push({ id, label: title });
        }
      }
    }

    const seen = new Set<string>();
    const platforms = configurations
      .filter((item) => {
        if (seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      });

    return {
      lines: Array.from(new Set(lines)),
      platforms,
      languages: ['it', 'en', 'fr', 'es', 'pt'],
      source: 'infrastruttura-api'
    };
  }

  private slugify(value: string): string {
    return String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
}

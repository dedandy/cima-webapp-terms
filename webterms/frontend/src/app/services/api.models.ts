export interface DocumentDto {
  id: string;
  downloadFileName?: string;
  originalFileName: string;
  line?: string;
  sha256: string;
  platform: string;
  docType: 'terms' | 'privacy' | 'cookie';
  lang: string;
  effectiveDate: string;
  version: number;
  deletedAt: string | null;
}

export interface DocumentsResponse {
  documents: DocumentDto[];
}

export interface PlatformOption {
  id: string;
  label: string;
}

export interface InfraConfigResponse {
  lines: string[];
  platforms: PlatformOption[];
  languages: string[];
  source: string;
}

export interface LoginResponse {
  token: string;
  user?: { username: string };
  source?: string;
}

export interface MeResponse {
  user?: Record<string, unknown>;
}

export interface PublicLatestEntry {
  id: string;
  line: string;
  version: number;
  effectiveDate: string;
  sha256: string;
  url: string;
  downloadUrl: string;
}

export interface PublicLatestResponse {
  latest: Record<string, Record<string, Record<string, PublicLatestEntry>>>;
}

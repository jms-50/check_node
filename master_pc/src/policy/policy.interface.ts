export class Policy {
  blocked_urls: string[];
  blocked_processes: string[];
  timestamp: number;
}

export class UpdatePolicyDto {
  blocked_urls?: string[];
  blocked_processes?: string[];
}

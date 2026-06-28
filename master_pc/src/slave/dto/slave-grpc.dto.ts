export class SlaveInfoRequest {
  hostname?: string;
  ip_address?: string;
  os_version?: string;
}

export class SlaveIdRequest {
  id: string;
}

export class EventLogRequest {
  slave_id: string;
  target: string;
  type: string;
  timestamp: number;
}

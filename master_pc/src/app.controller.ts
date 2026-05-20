import { Controller, Get, Post, Body } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { Observable, Subject } from 'rxjs';

class UpdatePolicyDto {
  blocked_urls?: string[];
  blocked_processes?: string[];
}

interface Policy {
  blocked_urls: string[];
  blocked_processes: string[];
  timestamp: number;
}

interface SlaveInfoRequest {
  hostname?: string;
  ip_address?: string;
  os_version?: string;
}

interface SlaveIdRequest {
  id: string;
}

interface EventLogRequest {
  slave_id: string;
  target: string;
  type: string;
  timestamp: number;
}

@Controller('admin')
export class AppController {
  private streams = new Map<string, Subject<Policy>>();

  private currentPolicy: Policy = {
    blocked_urls: [],
    blocked_processes: [],
    timestamp: Date.now(),
  };

  @Get('policy')
  getPolicy(): Policy {
    return this.currentPolicy;
  }

  @Post('policy')
  updatePolicy(@Body() newPolicy: UpdatePolicyDto = {}) {
    console.log('\n🚨 [ADMIN] 정책 업데이트 요청 수신!');

    const urls = Array.isArray(newPolicy.blocked_urls)
      ? newPolicy.blocked_urls
      : [];
    const processes = Array.isArray(newPolicy.blocked_processes)
      ? newPolicy.blocked_processes
      : [];

    this.currentPolicy = {
      blocked_urls: urls,
      blocked_processes: processes,
      timestamp: Date.now(),
    };

    let count = 0;
    this.streams.forEach((stream) => {
      stream.next(this.currentPolicy);
      count++;
    });

    console.log(`📢 총 ${count}대의 슬레이브에게 새 정책을 전파했습니다.\n`);

    return {
      message: 'Policy successfully updated and broadcasted!',
      policy: this.currentPolicy,
    };
  }

  @GrpcMethod('CheckNode', 'Register')
  register(data: SlaveInfoRequest) {
    const slaveId = `Node-${Math.random().toString(36).slice(2, 7)}`;
    console.log(
      `📡 [gRPC] 신규 슬레이브 등록: ${data.hostname || 'Unknown'} (ID: ${slaveId})`,
    );
    return { slave_id: slaveId };
  }

  @GrpcMethod('CheckNode', 'SubscribePolicy')
  subscribePolicy(data: SlaveIdRequest): Observable<Policy> {
    console.log(`🔗 [gRPC] 슬레이브 ${data.id} 정책 구독 시작`);

    const subject = new Subject<Policy>();
    this.streams.set(data.id, subject);

    setTimeout(() => {
      subject.next(this.currentPolicy);
    }, 100);

    return subject.asObservable();
  }

  @GrpcMethod('CheckNode', 'Heartbeat')
  heartbeat(data: SlaveIdRequest) {
    void data;
    return {};
  }

  @GrpcMethod('CheckNode', 'ReportEvent')
  reportEvent(data: EventLogRequest) {
    console.log(`\n⚠️ [VIOLATION] 슬레이브 ${data.slave_id} 차단 발생!`);
    console.log(`   - 타겟: ${data.target}`);
    console.log(`   - 유형: ${data.type}`);
    console.log(
      `   - 시간: ${new Date(data.timestamp * 1000).toLocaleString()}\n`,
    );
    return {};
  }
}

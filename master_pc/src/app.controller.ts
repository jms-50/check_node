import { Controller, Get, Post, Body } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { Observable, Subject } from 'rxjs';

class UpdatePolicyDto {
  blocked_urls: string[] = [];
  blocked_processes: string[] = [];
}

@Controller('admin')
export class AppController {
  private streams = new Map<string, Subject<any>>();

  // [수정됨] 명시적으로 string 배열 타입임을 TypeScript에게 알려줍니다.
  private currentPolicy: { blocked_urls: string[]; blocked_processes: string[]; timestamp: number } = {
    blocked_urls: [],
    blocked_processes: [],
    timestamp: Date.now(),
  };

  @Get('policy')
  getPolicy() {
    return this.currentPolicy;
  }

  @Post('policy')
  updatePolicy(@Body() newPolicy: UpdatePolicyDto) {
    console.log('\n🚨 [ADMIN] 정책 업데이트 요청 수신!');
    
    // [수정됨] 안전하게 기본값을 보장하는 로직으로 변경했습니다.
    const urls = (newPolicy && newPolicy.blocked_urls) ? newPolicy.blocked_urls : [];
    const processes = (newPolicy && newPolicy.blocked_processes) ? newPolicy.blocked_processes : [];

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
      policy: this.currentPolicy 
    };
  }

  @GrpcMethod('CheckNode', 'Register')
  register(data: any) {
    const slaveId = `Node-${Math.random().toString(36).slice(2, 7)}`;
    console.log(`📡 [gRPC] 신규 슬레이브 등록: ${data.hostname || 'Unknown'} (ID: ${slaveId})`);
    return { slave_id: slaveId };
  }

  @GrpcMethod('CheckNode', 'SubscribePolicy')
  subscribePolicy(data: { id: string }): Observable<any> {
    console.log(`🔗 [gRPC] 슬레이브 ${data.id} 정책 구독 시작`);
    
    const subject = new Subject();
    this.streams.set(data.id, subject);

    setTimeout(() => {
      subject.next(this.currentPolicy);
    }, 100);

    return subject.asObservable();
  }

  @GrpcMethod('CheckNode', 'Heartbeat')
  heartbeat(data: { id: string }) {
    return {};
  }

  @GrpcMethod('CheckNode', 'ReportEvent')
  reportEvent(data: any) {
    console.log(`\n⚠️ [VIOLATION] 슬레이브 ${data.slave_id} 차단 발생!`);
    console.log(`   - 타겟: ${data.target}`);
    console.log(`   - 유형: ${data.type}`);
    console.log(`   - 시간: ${new Date(data.timestamp * 1000).toLocaleString()}\n`);
    return {};
  }
}
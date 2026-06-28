import { Injectable, OnModuleInit } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { Policy, UpdatePolicyDto } from './policy.interface';
import {
  normalizeBlockedHosts,
  normalizeBlockedProcesses,
  normalizeSlaveId,
} from '../security/input-sanitizer';

@Injectable()
export class PolicyService implements OnModuleInit {
  private streams = new Map<string, Subject<Policy>>();

  // 휘발성 메모리 기반 상태 (DB에 저장하지 않음)
  private currentPolicy: Policy = {
    blocked_urls: [],
    blocked_processes: [],
    timestamp: Date.now(),
  };

  onModuleInit() {
    console.log('🔄 [POLICY] 정책 상태는 순수 메모리(휘발성) 기반으로 초기화되었습니다.');
  }

  getPolicy(): Policy {
    return clonePolicy(this.currentPolicy);
  }

  async updatePolicy(newPolicy: UpdatePolicyDto = {}): Promise<Policy> {
    console.log('\n🚨 [ADMIN] 정책 업데이트 요청 수신!');

    const urls = normalizeBlockedHosts(newPolicy.blocked_urls);
    const processes = normalizeBlockedProcesses(newPolicy.blocked_processes);

    this.currentPolicy = {
      blocked_urls: urls,
      blocked_processes: processes,
      timestamp: Date.now(),
    };

    let count = 0;
    this.streams.forEach((stream) => {
      stream.next(clonePolicy(this.currentPolicy));
      count++;
    });

    console.log(`📢 총 ${count}대의 슬레이브에게 새 정책을 전파했습니다.\n`);

    return clonePolicy(this.currentPolicy);
  }

  subscribePolicy(slaveId: string): Observable<Policy> {
    const normalizedSlaveId = normalizeSlaveId(slaveId, 'id');
    console.log(`🔗 [gRPC] 슬레이브 ${normalizedSlaveId} 정책 구독 시작`);

    const previousStream = this.streams.get(normalizedSlaveId);
    previousStream?.complete();

    const subject = new Subject<Policy>();
    this.streams.set(normalizedSlaveId, subject);

    return new Observable<Policy>((subscriber) => {
      const subscription = subject.subscribe(subscriber);
      const timer = setTimeout(() => {
        subject.next(clonePolicy(this.currentPolicy));
      }, 100);

      return () => {
        clearTimeout(timer);
        subscription.unsubscribe();
        subject.complete();

        if (this.streams.get(normalizedSlaveId) === subject) {
          this.streams.delete(normalizedSlaveId);
          console.log(`🔌 [gRPC] 슬레이브 ${normalizedSlaveId} 정책 구독 종료`);
        }
      };
    });
  }
}

function clonePolicy(policy: Policy): Policy {
  return {
    blocked_urls: [...policy.blocked_urls],
    blocked_processes: [...policy.blocked_processes],
    timestamp: policy.timestamp,
  };
}

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventLogRequest, SlaveIdRequest } from './dto/slave-grpc.dto';
import { SlaveEntity } from './slave.entity';
import { EventLogEntity } from './event-log.entity';
import {
  normalizeEventTarget,
  normalizeEventTimestamp,
  normalizeEventType,
  normalizeSlaveId,
} from '../security/input-sanitizer';

@Injectable()
export class EventLogService {
  constructor(
    @InjectRepository(SlaveEntity)
    private readonly slaveRepository: Repository<SlaveEntity>,
    @InjectRepository(EventLogEntity)
    private readonly eventLogRepository: Repository<EventLogEntity>,
  ) {}

  async heartbeat(data: SlaveIdRequest): Promise<{}> {
    const slaveId = normalizeSlaveId(data.id, 'id');
    const slave = await this.slaveRepository.findOne({ where: { id: slaveId } });
    if (slave) {
      slave.last_heartbeat = new Date();
      await this.slaveRepository.save(slave);
      console.log(`💓 [gRPC] 슬레이브 하트비트 수신: ${slaveId}`);
    } else {
      console.log(`⚠️ [gRPC] 등록되지 않은 슬레이브의 하트비트 시도: ${slaveId}`);
      const newSlave = this.slaveRepository.create({
        id: slaveId,
        last_heartbeat: new Date(),
      });
      await this.slaveRepository.save(newSlave);
    }
    return {};
  }

  async reportEvent(data: EventLogRequest): Promise<{}> {
    const slaveId = normalizeSlaveId(data.slave_id);
    const target = normalizeEventTarget(data.target);
    const type = normalizeEventType(data.type);
    const timestamp = normalizeEventTimestamp(data.timestamp);

    console.log(`\n⚠️ [VIOLATION] 슬레이브 ${slaveId} 차단 발생!`);
    console.log(`   - 타겟: ${target}`);
    console.log(`   - 유형: ${type}`);
    console.log(
      `   - 시간: ${new Date(timestamp * 1000).toLocaleString()}\n`,
    );

    // 외래 키 무결성을 보장하기 위해 슬레이브가 존재하는지 체크
    const slaveExists = await this.slaveRepository.findOne({ where: { id: slaveId } });
    if (!slaveExists) {
      console.log(`⚠️ [DB] 존재하지 않는 슬레이브 ${slaveId}에 대한 이벤트. 슬레이브 자동 등록.`);
      const newSlave = this.slaveRepository.create({
        id: slaveId,
        last_heartbeat: new Date(),
      });
      await this.slaveRepository.save(newSlave);
    }

    const eventLog = this.eventLogRepository.create({
      slave_id: slaveId,
      target,
      type,
      timestamp,
    });

    await this.eventLogRepository.save(eventLog);
    return {};
  }

  async getEvents(): Promise<EventLogEntity[]> {
    return this.eventLogRepository.find({
      order: { timestamp: 'DESC' },
      take: 100, // Limit to recent 100 events for performance
    });
  }
}

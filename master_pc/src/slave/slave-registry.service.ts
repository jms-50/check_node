import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { SlaveInfoRequest } from './dto/slave-grpc.dto';
import { SlaveEntity } from './slave.entity';
import { normalizeMetadata } from '../security/input-sanitizer';

@Injectable()
export class SlaveRegistryService {
  constructor(
    @InjectRepository(SlaveEntity)
    private readonly slaveRepository: Repository<SlaveEntity>,
  ) {}

  async register(data: SlaveInfoRequest): Promise<{ slave_id: string }> {
    const slaveId = `Node-${randomUUID()}`;
    const hostname = normalizeMetadata(data.hostname);
    const ipAddress = normalizeMetadata(data.ip_address);
    const osVersion = normalizeMetadata(data.os_version);

    console.log(
      `📡 [gRPC] 신규 슬레이브 등록: ${hostname || 'Unknown'} (ID: ${slaveId})`,
    );

    const slave = this.slaveRepository.create({
      id: slaveId,
      hostname,
      ip_address: ipAddress,
      os_version: osVersion,
      last_heartbeat: new Date(),
    });

    await this.slaveRepository.save(slave);

    return { slave_id: slaveId };
  }

  async getSlaves(): Promise<SlaveEntity[]> {
    return this.slaveRepository.find();
  }
}

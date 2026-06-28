import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { SlaveEntity } from './slave.entity';

@Entity('event_log')
export class EventLogEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  slave_id: string;

  @ManyToOne(() => SlaveEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'slave_id' })
  slave: SlaveEntity;

  @Column()
  target: string;

  @Column()
  type: string;

  @Column({ type: 'integer' })
  timestamp: number;
}

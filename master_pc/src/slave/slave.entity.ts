import { Entity, PrimaryColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('slave')
export class SlaveEntity {
  @PrimaryColumn()
  id: string;

  @Column({ nullable: true })
  hostname?: string;

  @Column({ nullable: true })
  ip_address?: string;

  @Column({ nullable: true })
  os_version?: string;

  @CreateDateColumn()
  registered_at: Date;

  @Column({ type: 'datetime', nullable: true })
  last_heartbeat?: Date;
}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PolicyModule } from './policy/policy.module';
import { SlaveModule } from './slave/slave.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'sqlite',
      database: process.env.SQLITE_DATABASE || 'database.sqlite',
      autoLoadEntities: true,
      synchronize:
        process.env.NODE_ENV !== 'production' &&
        process.env.TYPEORM_SYNCHRONIZE !== 'false',
    }),
    PolicyModule,
    SlaveModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}

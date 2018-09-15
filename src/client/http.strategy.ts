import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-http-bearer';
import { Client } from '../entities/client.entity';

@Injectable()
export class HttpStrategy extends PassportStrategy(Strategy) {
  public async validate(token: string) {
    const client = await Client.findOne(token);
    if (!client) {
      throw new UnauthorizedException();
    }
    return client;
  }
}

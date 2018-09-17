import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-http-signature';
import { Client } from '../entities/client.entity';

@Injectable()
export class SignatureStrategy extends PassportStrategy(Strategy, 'signature') {
  public async validate(
    keyId: string,
    done: (_: null, client: Client, publicKey: string) => void,
  ) {
    const client = await Client.findOne({ name: keyId });
    if (!client) {
      throw new UnauthorizedException();
    }
    done(null, client, client.publicKey);
    return client;
  }
}

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
    console.log('---------------');
    console.log(keyId);
    console.log(done);
    const client = await Client.findOne({ name: keyId });
    if (!client) {
      throw new UnauthorizedException();
    }
    const x = done(null, client, client.publicKey);
    console.log(x);
    return client;
  }
}

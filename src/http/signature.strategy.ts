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
    // tslint:disable-next-line: no-dead-store
    const { name, fingerprint } = await new Promise((resolve, reject) => {
      keyId.replace(
        /^\/(\w+)\/keys\/([0-9a-f:]+)$/,
        (_: string, n: string, f: string): string => {
          resolve({ name: n, fingerprint: f });
          return '';
        },
      );
      reject(new UnauthorizedException('Bad keyId Format'));
    });
    const client = await Client.findOne({ name });
    if (!client) {
      throw new UnauthorizedException('Client Name Not Found');
    }
    done(null, client, client.publicKey);
    return client;
  }
}

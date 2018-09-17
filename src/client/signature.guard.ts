import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class SignatureGuard extends AuthGuard('signature') {
  public async canActivate(context: ExecutionContext): Promise<boolean> {
    console.log(context.getArgByIndex(0).headers);
    // return true;
    const res = (await super.canActivate(context)) as boolean;
    console.log('~~~~~~~~~~~~~');
    console.log(res);
    return res;
  }

  public handleRequest(err: any, user: any, info: any) {
    if (err || !user) {
      console.log(err);
      console.log(user);
      console.log(info);
      throw err || new UnauthorizedException();
    }
    return user;
  }
}

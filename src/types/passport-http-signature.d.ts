/// <reference types="passport"/>
/// <reference types="express" />

// import passport = require('passport');
// import express = require('express');

declare module 'passport-http-signature' {
  interface IStrategyOptions {
    scope: string | string[];
    realm: string;
    passReqToCallback: boolean;
  }
  interface IVerifyOptions {
    message: string;
    scope: string | string[];
  }

  type VerifyFunction = (
      token: string,
      done: (error: any, user?: any, options?: IVerifyOptions | string) => void,
    ) => void;

  // interface VerifyFunctionWithRequest {
  //   (
  //     req: express.Request,
  //     token: string,
  //     done: (error: any, user?: any, options?: IVerifyOptions | string) => void,
  //   ): void;
  // }

  class Strategy {
    // class Strategy implements passport.Strategy {
    // constructor(verify: VerifyFunction);
    // constructor(options: IStrategyOptions, verify: VerifyFunction);
    // constructor(options: IStrategyOptions, verify: VerifyFunctionWithRequest);
    // name: string;
    // authenticate(req: express.Request, options?: Object): void;
  }
}

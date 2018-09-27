import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialMigration1537423629359 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(`
      CREATE TYPE "coin_symbol_enum" AS ENUM('BTC', 'ETH', 'EOS', 'CFC');
      CREATE TYPE "chain_enum" AS ENUM('bitcoin', 'ethereum', 'eos');
      CREATE TYPE "withdrawal_status_enum" AS ENUM('created', 'finished');
      CREATE TYPE "deposit_status_enum" AS ENUM('unconfirmed', 'confirmed', 'finished', 'attacked');

      CREATE TABLE "coin" (
        "symbol" "coin_symbol_enum" PRIMARY KEY,
        "chain" character varying NOT NULL,
        "depositFeeAmount" integer NOT NULL,
        "depositFeeSymbol" "coin_symbol_enum" NOT NULL,
        "withdrawalFeeAmount" integer NOT NULL,
        "withdrawalFeeSymbol" "coin_symbol_enum" NOT NULL,
        "info" jsonb NOT NULL DEFAULT '{}',
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
      );

      CREATE TABLE "client" (
        "id" SERIAL PRIMARY KEY,
        "name" character varying NOT NULL,
        "publicKey" character varying NOT NULL,
        "ip" character varying,
        UNIQUE ("name")
      );

      CREATE TABLE "account" (
        "coinSymbol" "coin_symbol_enum" NOT NULL,
        "clientId" integer NOT NULL,
        "balance" numeric(24,8) NOT NULL DEFAULT 0,
        "info" jsonb NOT NULL DEFAULT '{}',
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        PRIMARY KEY ("coinSymbol", "clientId")
      );

      CREATE TABLE "addr" (
        "chain" "chain_enum" NOT NULL,
        "clientId" integer NOT NULL,
        "path" character varying NOT NULL,
        "addr" character varying NOT NULL,
        "info" jsonb NOT NULL DEFAULT '{}',
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        PRIMARY KEY ("chain", "clientId", "path"),
        UNIQUE ("chain", "addr")
      );

      CREATE TABLE "withdrawal" (
        "id" SERIAL PRIMARY KEY,
        "clientId" integer NOT NULL,
        "key" character varying NOT NULL,
        "coinSymbol" "coin_symbol_enum" NOT NULL,
        "recipient" character varying NOT NULL,
        "memo" character varying,
        "amount" numeric(16,8) NOT NULL,
        "feeAmount" integer,
        "feeSymbol" "coin_symbol_enum",
        "status" "withdrawal_status_enum" NOT NULL DEFAULT 'created',
        "txHash" character varying,
        "info" jsonb NOT NULL DEFAULT '{}',
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "depositId" integer,
        UNIQUE ("depositId"),
        UNIQUE ("clientId", "key")
      );

      CREATE TABLE "deposit" (
        "id" SERIAL PRIMARY KEY,
        "coinSymbol" "coin_symbol_enum" NOT NULL,
        "clientId" integer NOT NULL,
        "addrPath" character varying NOT NULL,
        "amount" numeric(16,8) NOT NULL,
        "feeAmount" integer,
        "feeSymbol" "coin_symbol_enum",
        "status" "deposit_status_enum" NOT NULL DEFAULT 'unconfirmed',
        "txHash" character varying,
        "info" jsonb NOT NULL DEFAULT '{}',
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "withdrawalId" integer,
        UNIQUE ("withdrawalId")
      );

      CREATE TABLE "kv_pair" (
        "key" character varying PRIMARY KEY,
        "value" jsonb NOT NULL
      );

      ALTER TABLE "account"
      ADD CONSTRAINT "FK_861667d82d42bf6617f423f537b"
      FOREIGN KEY ("clientId")
      REFERENCES "client"("id") ON DELETE CASCADE;

      ALTER TABLE "addr"
      ADD CONSTRAINT "FK_d4638cb77adb629796ef446df62"
      FOREIGN KEY ("clientId")
      REFERENCES "client"("id") ON DELETE CASCADE;

      ALTER TABLE "withdrawal"
      ADD CONSTRAINT "FK_c49c38eb68782a2a7f254e05993"
      FOREIGN KEY ("depositId")
      REFERENCES "deposit"("id");

      ALTER TABLE "withdrawal"
      ADD CONSTRAINT "FK_804f38351628d8076bb6d0ba337"
      FOREIGN KEY ("clientId")
      REFERENCES "client"("id") ON DELETE CASCADE;

      ALTER TABLE "deposit"
      ADD CONSTRAINT "FK_a4e41bb666e25795577fd9ac155"
      FOREIGN KEY ("withdrawalId")
      REFERENCES "withdrawal"("id");

      ALTER TABLE "deposit"
      ADD CONSTRAINT "FK_e1886ba77141192085e44e4e878"
      FOREIGN KEY ("clientId")
      REFERENCES "client"("id") ON DELETE CASCADE;

      INSERT INTO coin (
        chain, "depositFeeAmount", "depositFeeSymbol", symbol, "withdrawalFeeAmount", "withdrawalFeeSymbol", info
      ) VALUES (
        'bitcoin', 0, 'BTC', 'BTC', 0, 'BTC', '{ "depositCursor": "", "withdrawalCursor": 0 }'::jsonb
      );

      INSERT INTO coin (
        chain, "depositFeeAmount", "depositFeeSymbol", symbol, "withdrawalFeeAmount", "withdrawalFeeSymbol", info
      ) VALUES (
        'ethereum', 0, 'ETH', 'ETH', 0, 'ETH', '{ "cursor": 0, "fee": 0 }'::jsonb
      );

      INSERT INTO coin (
        chain, "depositFeeAmount", "depositFeeSymbol", symbol, "withdrawalFeeAmount", "withdrawalFeeSymbol", info
      ) VALUES (
        'ethereum', 0, 'ETH', 'CFC', 0, 'ETH', '{ "cursor": 0, "fee": 0 }'::jsonb
      );

      INSERT INTO kv_pair (key, "value") VALUES ('ethWithdrawalNonce', '0'::jsonb);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(`
      ALTER TABLE "deposit" DROP CONSTRAINT "FK_e1886ba77141192085e44e4e878";
      ALTER TABLE "deposit" DROP CONSTRAINT "FK_a4e41bb666e25795577fd9ac155";
      ALTER TABLE "withdrawal" DROP CONSTRAINT "FK_804f38351628d8076bb6d0ba337";
      ALTER TABLE "withdrawal" DROP CONSTRAINT "FK_c49c38eb68782a2a7f254e05993";
      ALTER TABLE "addr" DROP CONSTRAINT "FK_d4638cb77adb629796ef446df62";
      ALTER TABLE "account" DROP CONSTRAINT "FK_861667d82d42bf6617f423f537b";

      DROP TABLE "kv_pair";
      DROP TABLE "deposit";
      DROP TABLE "withdrawal";
      DROP TABLE "coin";
      DROP TABLE "addr";
      DROP TABLE "account";
      DROP TABLE "client";
      DROP TYPE "deposit_status_enum";
      DROP TYPE "coin_symbol_enum";
      DROP TYPE "withdrawal_status_enum";
      DROP TYPE "chain_enum";
    `);
  }
}

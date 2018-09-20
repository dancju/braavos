import {MigrationInterface, QueryRunner} from 'typeorm';

export class InitialMigration1537423629359 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`CREATE TYPE "coin_symbol_enum" AS ENUM('BTC', 'ETH', 'EOS', 'CFC')`);
        await queryRunner.query(`CREATE TYPE "chain_enum" AS ENUM('bitcoin', 'ethereum', 'eos')`);
        await queryRunner.query(`CREATE TYPE "withdrawal_status_enum" AS ENUM('created', 'finished')`);
        await queryRunner.query(`CREATE TYPE "deposit_status_enum" AS ENUM('unconfirmed', 'confirmed', 'finished', 'attacked')`);
        await queryRunner.query(`CREATE TABLE "client" ("id" SERIAL NOT NULL, "name" character varying NOT NULL, "publicKey" character varying NOT NULL, "ip" character varying, CONSTRAINT "PK_96da49381769303a6515a8785c7" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "account" ("coinSymbol" "coin_symbol_enum" NOT NULL, "clientId" integer NOT NULL, "balance" numeric(24,8) NOT NULL DEFAULT 0, "info" jsonb NOT NULL DEFAULT '{}', "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_17dadc19f913430881ed4635657" PRIMARY KEY ("coinSymbol", "clientId"))`);
        await queryRunner.query(`CREATE TABLE "addr" ("chain" "chain_enum" NOT NULL, "clientId" integer NOT NULL, "path" character varying NOT NULL, "addr" character varying NOT NULL, "info" jsonb NOT NULL DEFAULT '{}', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_c50178a17c41701d129cb81ee53" PRIMARY KEY ("chain", "clientId", "path"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_c933e799c61bbcdd5d1b46778f" ON "addr"("chain", "addr") `);
        await queryRunner.query(`CREATE TABLE "coin" ("symbol" "coin_symbol_enum" NOT NULL, "chain" character varying NOT NULL, "depositFeeAmount" integer NOT NULL, "depositFeeSymbol" "coin_symbol_enum" NOT NULL, "withdrawalFeeAmount" integer NOT NULL, "withdrawalFeeSymbol" "coin_symbol_enum" NOT NULL, "info" jsonb NOT NULL DEFAULT '{}', "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_68fba9809ca6821a9d6823942aa" PRIMARY KEY ("symbol"))`);
        await queryRunner.query(`CREATE TABLE "withdrawal" ("id" SERIAL NOT NULL, "clientId" integer NOT NULL, "key" character varying NOT NULL, "coinSymbol" "coin_symbol_enum" NOT NULL, "recipient" character varying NOT NULL, "memo" character varying, "amount" numeric(16,8) NOT NULL, "feeAmount" integer, "feeSymbol" "coin_symbol_enum", "status" "withdrawal_status_enum" NOT NULL DEFAULT 'created', "txHash" character varying, "info" jsonb NOT NULL DEFAULT '{}', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "depositId" integer, CONSTRAINT "REL_c49c38eb68782a2a7f254e0599" UNIQUE ("depositId"), CONSTRAINT "PK_840e247aaad3fbd4e18129122a2" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_e1aa36abaa7395716032baff96" ON "withdrawal"("clientId", "key") `);
        await queryRunner.query(`CREATE TABLE "deposit" ("id" SERIAL NOT NULL, "coinSymbol" "coin_symbol_enum" NOT NULL, "clientId" integer NOT NULL, "addrPath" character varying NOT NULL, "amount" numeric(16,8) NOT NULL, "feeAmount" integer NOT NULL, "feeSymbol" "coin_symbol_enum" NOT NULL, "status" "deposit_status_enum" NOT NULL DEFAULT 'unconfirmed', "txHash" character varying, "info" jsonb NOT NULL DEFAULT '{}', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "withdrawalId" integer, CONSTRAINT "REL_a4e41bb666e25795577fd9ac15" UNIQUE ("withdrawalId"), CONSTRAINT "PK_6654b4be449dadfd9d03a324b61" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "kv_pair" ("key" character varying NOT NULL, "value" jsonb NOT NULL, CONSTRAINT "PK_47de5fced06a67bda78b13c1d5d" PRIMARY KEY ("key"))`);
        await queryRunner.query(`ALTER TABLE "account" ADD CONSTRAINT "FK_861667d82d42bf6617f423f537b" FOREIGN KEY ("clientId") REFERENCES "client"("id")`);
        await queryRunner.query(`ALTER TABLE "addr" ADD CONSTRAINT "FK_d4638cb77adb629796ef446df62" FOREIGN KEY ("clientId") REFERENCES "client"("id")`);
        await queryRunner.query(`ALTER TABLE "withdrawal" ADD CONSTRAINT "FK_c49c38eb68782a2a7f254e05993" FOREIGN KEY ("depositId") REFERENCES "deposit"("id")`);
        await queryRunner.query(`ALTER TABLE "withdrawal" ADD CONSTRAINT "FK_804f38351628d8076bb6d0ba337" FOREIGN KEY ("clientId") REFERENCES "client"("id")`);
        await queryRunner.query(`ALTER TABLE "deposit" ADD CONSTRAINT "FK_a4e41bb666e25795577fd9ac155" FOREIGN KEY ("withdrawalId") REFERENCES "withdrawal"("id")`);
        await queryRunner.query(`ALTER TABLE "deposit" ADD CONSTRAINT "FK_e1886ba77141192085e44e4e878" FOREIGN KEY ("clientId") REFERENCES "client"("id")`);
    }

    public async down(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`ALTER TABLE "deposit" DROP CONSTRAINT "FK_e1886ba77141192085e44e4e878"`);
        await queryRunner.query(`ALTER TABLE "deposit" DROP CONSTRAINT "FK_a4e41bb666e25795577fd9ac155"`);
        await queryRunner.query(`ALTER TABLE "withdrawal" DROP CONSTRAINT "FK_804f38351628d8076bb6d0ba337"`);
        await queryRunner.query(`ALTER TABLE "withdrawal" DROP CONSTRAINT "FK_c49c38eb68782a2a7f254e05993"`);
        await queryRunner.query(`ALTER TABLE "addr" DROP CONSTRAINT "FK_d4638cb77adb629796ef446df62"`);
        await queryRunner.query(`ALTER TABLE "account" DROP CONSTRAINT "FK_861667d82d42bf6617f423f537b"`);
        await queryRunner.query(`DROP TABLE "kv_pair"`);
        await queryRunner.query(`DROP TABLE "deposit"`);
        await queryRunner.query(`DROP INDEX "IDX_e1aa36abaa7395716032baff96"`);
        await queryRunner.query(`DROP TABLE "withdrawal"`);
        await queryRunner.query(`DROP TABLE "coin"`);
        await queryRunner.query(`DROP INDEX "IDX_c933e799c61bbcdd5d1b46778f"`);
        await queryRunner.query(`DROP TABLE "addr"`);
        await queryRunner.query(`DROP TABLE "account"`);
        await queryRunner.query(`DROP TABLE "client"`);
        await queryRunner.query(`DROP TYPE "deposit_status_enum"`);
        await queryRunner.query(`DROP TYPE "coin_symbol_enum"`);
        await queryRunner.query(`DROP TYPE "withdrawal_status_enum"`);
        await queryRunner.query(`DROP TYPE "chain_enum"`);
    }
}

import assert from "node:assert/strict";
import * as anchor from "@coral-xyz/anchor";
import { AnchorError, BN, type Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import type { PulsoAnchor } from "../target/types/pulso_anchor.js";

const bytes = (value: number) => Array<number>(32).fill(value);
const sequenceSeed = (sequence: number) => new BN(sequence).toArrayLike(Buffer, "le", 8);

describe("pulso_anchor", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.pulsoAnchor as Program<PulsoAnchor>;
  const authority = provider.wallet.publicKey;
  const incidentCommitment = bytes(7);
  const [registry] = PublicKey.findProgramAddressSync(
    [Buffer.from("registry"), Buffer.from(incidentCommitment)],
    program.programId,
  );
  const batchAddress = (sequence: number) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("batch"), registry.toBuffer(), sequenceSeed(sequence)],
      program.programId,
    )[0];

  it("initializes one opaque incident registry", async () => {
    await program.methods
      .initializeRegistry(incidentCommitment)
      .accountsStrict({
        payer: authority,
        authority,
        registry,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const state = await program.account.registry.fetch(registry);
    assert.equal(state.authority.equals(authority), true);
    assert.equal(state.nextSequence.toNumber(), 0);
    assert.deepEqual(Array.from(state.lastRoot), bytes(0));
  });

  it("anchors the first batch and advances the hash chain", async () => {
    await program.methods
      .appendBatch(new BN(0), 1, bytes(1), bytes(0), bytes(2), new BN(100), new BN(200))
      .accountsStrict({
        payer: authority,
        authority,
        registry,
        batch: batchAddress(0),
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const state = await program.account.registry.fetch(registry);
    const batch = await program.account.auditBatch.fetch(batchAddress(0));
    assert.equal(state.nextSequence.toNumber(), 1);
    assert.deepEqual(Array.from(state.lastRoot), bytes(1));
    assert.equal(batch.sequence.toNumber(), 0);
    assert.deepEqual(Array.from(batch.manifestHash), bytes(2));
  });

  it("rejects a skipped sequence without changing the registry", async () => {
    let rejected = false;
    try {
      await program.methods
        .appendBatch(new BN(2), 1, bytes(3), bytes(1), bytes(4), new BN(200), new BN(300))
        .accountsStrict({
          payer: authority,
          authority,
          registry,
          batch: batchAddress(2),
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    } catch (error) {
      rejected = true;
      assert.ok(error instanceof AnchorError);
      assert.equal(error.error.errorCode.code, "InvalidSequence");
    }
    assert.equal(rejected, true);
    const state = await program.account.registry.fetch(registry);
    assert.equal(state.nextSequence.toNumber(), 1);
  });

  it("rejects a broken hash chain without changing the registry", async () => {
    let rejected = false;
    try {
      await program.methods
        .appendBatch(new BN(1), 1, bytes(3), bytes(9), bytes(4), new BN(200), new BN(300))
        .accountsStrict({
          payer: authority,
          authority,
          registry,
          batch: batchAddress(1),
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    } catch (error) {
      rejected = true;
      assert.ok(error instanceof AnchorError);
      assert.equal(error.error.errorCode.code, "InvalidPreviousRoot");
    }
    assert.equal(rejected, true);
    const state = await program.account.registry.fetch(registry);
    assert.equal(state.nextSequence.toNumber(), 1);
    assert.deepEqual(Array.from(state.lastRoot), bytes(1));
  });

  it("anchors the next batch only when its previous root matches", async () => {
    await program.methods
      .appendBatch(new BN(1), 1, bytes(3), bytes(1), bytes(4), new BN(200), new BN(300))
      .accountsStrict({
        payer: authority,
        authority,
        registry,
        batch: batchAddress(1),
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const state = await program.account.registry.fetch(registry);
    assert.equal(state.nextSequence.toNumber(), 2);
    assert.deepEqual(Array.from(state.lastRoot), bytes(3));
  });
});

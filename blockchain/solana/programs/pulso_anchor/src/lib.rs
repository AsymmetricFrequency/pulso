#![allow(deprecated, unexpected_cfgs)]

use anchor_lang::prelude::*;

declare_id!("DBfKewHG6MgNjuiRhUhMUZrgq2Qh3ZRjwbCVxBbBodHx");

const REGISTRY_VERSION: u8 = 1;
const BATCH_VERSION: u8 = 1;
const ZERO_HASH: [u8; 32] = [0; 32];

#[program]
pub mod pulso_anchor {
    use super::*;

    pub fn initialize_registry(
        ctx: Context<InitializeRegistry>,
        incident_commitment: [u8; 32],
    ) -> Result<()> {
        require!(
            incident_commitment != ZERO_HASH,
            PulsoAnchorError::EmptyIncidentCommitment
        );

        let now = Clock::get()?.unix_timestamp;
        let registry = &mut ctx.accounts.registry;
        registry.version = REGISTRY_VERSION;
        registry.bump = ctx.bumps.registry;
        registry.authority = ctx.accounts.authority.key();
        registry.incident_commitment = incident_commitment;
        registry.next_sequence = 0;
        registry.last_root = ZERO_HASH;
        registry.last_period_end = 0;
        registry.created_at = now;
        registry.updated_at = now;

        emit!(RegistryInitialized {
            registry: registry.key(),
            authority: registry.authority,
            incident_commitment,
            created_at: now,
        });
        Ok(())
    }

    #[allow(clippy::too_many_arguments)]
    pub fn append_batch(
        ctx: Context<AppendBatch>,
        sequence: u64,
        schema_version: u16,
        merkle_root: [u8; 32],
        previous_root: [u8; 32],
        manifest_hash: [u8; 32],
        period_start: i64,
        period_end: i64,
    ) -> Result<()> {
        validate_batch(
            &ctx.accounts.registry,
            sequence,
            schema_version,
            merkle_root,
            previous_root,
            manifest_hash,
            period_start,
            period_end,
        )?;

        let now = Clock::get()?.unix_timestamp;
        let registry_key = ctx.accounts.registry.key();
        let batch = &mut ctx.accounts.batch;
        batch.version = BATCH_VERSION;
        batch.bump = ctx.bumps.batch;
        batch.registry = registry_key;
        batch.sequence = sequence;
        batch.schema_version = schema_version;
        batch.merkle_root = merkle_root;
        batch.previous_root = previous_root;
        batch.manifest_hash = manifest_hash;
        batch.period_start = period_start;
        batch.period_end = period_end;
        batch.created_at = now;

        let registry = &mut ctx.accounts.registry;
        registry.next_sequence = sequence
            .checked_add(1)
            .ok_or(PulsoAnchorError::SequenceOverflow)?;
        registry.last_root = merkle_root;
        registry.last_period_end = period_end;
        registry.updated_at = now;

        emit!(BatchAnchored {
            registry: registry_key,
            batch: batch.key(),
            sequence,
            schema_version,
            merkle_root,
            previous_root,
            manifest_hash,
            period_start,
            period_end,
            anchored_at: now,
        });
        Ok(())
    }

    pub fn rotate_authority(ctx: Context<RotateAuthority>, new_authority: Pubkey) -> Result<()> {
        require_keys_neq!(
            new_authority,
            Pubkey::default(),
            PulsoAnchorError::InvalidAuthority
        );
        require_keys_neq!(
            new_authority,
            ctx.accounts.authority.key(),
            PulsoAnchorError::AuthorityUnchanged
        );

        let registry = &mut ctx.accounts.registry;
        let previous_authority = registry.authority;
        registry.authority = new_authority;
        registry.updated_at = Clock::get()?.unix_timestamp;

        emit!(AuthorityRotated {
            registry: registry.key(),
            previous_authority,
            new_authority,
            rotated_at: registry.updated_at,
        });
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(incident_commitment: [u8; 32])]
pub struct InitializeRegistry<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    pub authority: Signer<'info>,
    #[account(
        init,
        payer = payer,
        space = Registry::SPACE,
        seeds = [b"registry", incident_commitment.as_ref()],
        bump
    )]
    pub registry: Account<'info, Registry>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(sequence: u64)]
pub struct AppendBatch<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    pub authority: Signer<'info>,
    #[account(mut, has_one = authority @ PulsoAnchorError::Unauthorized)]
    pub registry: Account<'info, Registry>,
    #[account(
        init,
        payer = payer,
        space = AuditBatch::SPACE,
        seeds = [b"batch", registry.key().as_ref(), &sequence.to_le_bytes()],
        bump
    )]
    pub batch: Account<'info, AuditBatch>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RotateAuthority<'info> {
    pub authority: Signer<'info>,
    #[account(mut, has_one = authority @ PulsoAnchorError::Unauthorized)]
    pub registry: Account<'info, Registry>,
}

#[account]
pub struct Registry {
    pub version: u8,
    pub bump: u8,
    pub authority: Pubkey,
    pub incident_commitment: [u8; 32],
    pub next_sequence: u64,
    pub last_root: [u8; 32],
    pub last_period_end: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

impl Registry {
    pub const SPACE: usize = 8 + 1 + 1 + 32 + 32 + 8 + 32 + 8 + 8 + 8;
}

#[account]
pub struct AuditBatch {
    pub version: u8,
    pub bump: u8,
    pub registry: Pubkey,
    pub sequence: u64,
    pub schema_version: u16,
    pub merkle_root: [u8; 32],
    pub previous_root: [u8; 32],
    pub manifest_hash: [u8; 32],
    pub period_start: i64,
    pub period_end: i64,
    pub created_at: i64,
}

impl AuditBatch {
    pub const SPACE: usize = 8 + 1 + 1 + 32 + 8 + 2 + 32 + 32 + 32 + 8 + 8 + 8;
}

#[event]
pub struct RegistryInitialized {
    pub registry: Pubkey,
    pub authority: Pubkey,
    pub incident_commitment: [u8; 32],
    pub created_at: i64,
}

#[event]
pub struct BatchAnchored {
    pub registry: Pubkey,
    pub batch: Pubkey,
    pub sequence: u64,
    pub schema_version: u16,
    pub merkle_root: [u8; 32],
    pub previous_root: [u8; 32],
    pub manifest_hash: [u8; 32],
    pub period_start: i64,
    pub period_end: i64,
    pub anchored_at: i64,
}

#[event]
pub struct AuthorityRotated {
    pub registry: Pubkey,
    pub previous_authority: Pubkey,
    pub new_authority: Pubkey,
    pub rotated_at: i64,
}

#[error_code]
pub enum PulsoAnchorError {
    #[msg("La autoridad no puede operar este registro.")]
    Unauthorized,
    #[msg("El compromiso del incidente no puede estar vacío.")]
    EmptyIncidentCommitment,
    #[msg("La secuencia no es la siguiente esperada.")]
    InvalidSequence,
    #[msg("La secuencia excedió su capacidad.")]
    SequenceOverflow,
    #[msg("La versión del esquema debe ser mayor que cero.")]
    InvalidSchemaVersion,
    #[msg("La raíz Merkle no puede estar vacía.")]
    EmptyMerkleRoot,
    #[msg("El hash del manifiesto no puede estar vacío.")]
    EmptyManifestHash,
    #[msg("La raíz anterior no coincide con el registro.")]
    InvalidPreviousRoot,
    #[msg("El periodo del lote es inválido.")]
    InvalidPeriod,
    #[msg("La nueva autoridad es inválida.")]
    InvalidAuthority,
    #[msg("La nueva autoridad debe ser diferente.")]
    AuthorityUnchanged,
}

#[allow(clippy::too_many_arguments)]
fn validate_batch(
    registry: &Registry,
    sequence: u64,
    schema_version: u16,
    merkle_root: [u8; 32],
    previous_root: [u8; 32],
    manifest_hash: [u8; 32],
    period_start: i64,
    period_end: i64,
) -> Result<()> {
    require_eq!(
        sequence,
        registry.next_sequence,
        PulsoAnchorError::InvalidSequence
    );
    require!(schema_version > 0, PulsoAnchorError::InvalidSchemaVersion);
    require!(merkle_root != ZERO_HASH, PulsoAnchorError::EmptyMerkleRoot);
    require!(
        manifest_hash != ZERO_HASH,
        PulsoAnchorError::EmptyManifestHash
    );
    let expected_previous = if sequence == 0 {
        ZERO_HASH
    } else {
        registry.last_root
    };
    require!(
        previous_root == expected_previous,
        PulsoAnchorError::InvalidPreviousRoot
    );
    require!(period_start <= period_end, PulsoAnchorError::InvalidPeriod);
    if sequence > 0 {
        require!(
            period_start >= registry.last_period_end,
            PulsoAnchorError::InvalidPeriod
        );
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn registry(next_sequence: u64, last_root: [u8; 32], last_period_end: i64) -> Registry {
        Registry {
            version: REGISTRY_VERSION,
            bump: 255,
            authority: Pubkey::new_unique(),
            incident_commitment: [9; 32],
            next_sequence,
            last_root,
            last_period_end,
            created_at: 1,
            updated_at: 1,
        }
    }

    #[test]
    fn accepts_the_first_valid_batch() {
        let result = validate_batch(
            &registry(0, ZERO_HASH, 0),
            0,
            1,
            [1; 32],
            ZERO_HASH,
            [2; 32],
            100,
            200,
        );
        assert!(result.is_ok());
    }

    #[test]
    fn accepts_the_next_linked_batch() {
        let result = validate_batch(
            &registry(1, [1; 32], 200),
            1,
            1,
            [3; 32],
            [1; 32],
            [4; 32],
            200,
            300,
        );
        assert!(result.is_ok());
    }

    #[test]
    fn rejects_a_skipped_sequence() {
        let result = validate_batch(
            &registry(1, [1; 32], 200),
            2,
            1,
            [3; 32],
            [1; 32],
            [4; 32],
            200,
            300,
        );
        assert!(result.is_err());
    }

    #[test]
    fn rejects_a_broken_hash_chain() {
        let result = validate_batch(
            &registry(1, [1; 32], 200),
            1,
            1,
            [3; 32],
            [8; 32],
            [4; 32],
            200,
            300,
        );
        assert!(result.is_err());
    }

    #[test]
    fn rejects_an_overlapping_period() {
        let result = validate_batch(
            &registry(1, [1; 32], 200),
            1,
            1,
            [3; 32],
            [1; 32],
            [4; 32],
            199,
            300,
        );
        assert!(result.is_err());
    }
}

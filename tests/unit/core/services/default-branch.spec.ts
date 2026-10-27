import {PrGateway} from '../../../../src/core/interfaces/pr-gateway';
import {VcsGateway} from '../../../../src/core/interfaces/vcs-gateway';
import {resolveDefaultBranch} from '../../../../src/core/services/default-branch';

describe('resolveDefaultBranch', () => {
  const vcsDefault = vi.fn();
  const prDefault = vi.fn();
  const vcs = {defaultBranch: vcsDefault} as unknown as VcsGateway;
  const prs = {defaultBranch: prDefault} as unknown as PrGateway;

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("Should take origin/HEAD's branch without asking gh", async () => {
    vcsDefault.mockResolvedValue('main');
    expect(await resolveDefaultBranch(vcs, prs, '/r/talon')).toBe('main');
    expect(vcsDefault).toHaveBeenCalledWith('/r/talon');
    expect(prDefault).not.toHaveBeenCalled();
  });

  it('Should fall back to gh when origin/HEAD is unset', async () => {
    vcsDefault.mockResolvedValue(null);
    prDefault.mockResolvedValue('trunk');
    expect(await resolveDefaultBranch(vcs, prs, '/r/talon')).toBe('trunk');
    expect(prDefault).toHaveBeenCalledWith('/r/talon');
  });

  it("Should propagate gh's refusal", async () => {
    vcsDefault.mockResolvedValue(null);
    prDefault.mockRejectedValue(
      new Error('Não foi possível descobrir o branch padrão'),
    );
    await expect(resolveDefaultBranch(vcs, prs, '/r/talon')).rejects.toThrow(
      'Não foi possível descobrir o branch padrão',
    );
  });
});

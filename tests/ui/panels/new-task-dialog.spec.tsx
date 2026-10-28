import {fireEvent, render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {NewTaskDialog} from '../../../src/application/ui/panels/new-task-dialog';

const repos = [
  {id: 'repo-a', name: 'repo-a', group: '', path: '/tmp/x/repo-a'},
  {id: 'repo-b', name: 'repo-b', group: '', path: '/tmp/x/repo-b'},
];

const setup = (
  overrides: Partial<Parameters<typeof NewTaskDialog>[0]> = {},
) => {
  const props = {
    open: true,
    repos,
    defaultRepoId: 'repo-b' as string | null,
    onCancel: vi.fn(),
    onSubmit: vi.fn(),
    ...overrides,
  };
  const view = render(<NewTaskDialog {...props} />);
  return {props, view};
};

describe('NewTaskDialog', () => {
  it('Should render nothing when closed', () => {
    const {view} = setup({open: false});
    expect(view.container).toBeEmptyDOMElement();
  });

  it('Should be a modal dialog with an autofocused description', () => {
    setup();
    const dialog = screen.getByRole('dialog', {name: 'Nova tarefa'});
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByLabelText('Descrição')).toHaveFocus();
    expect(screen.getByLabelText('Repositório')).toHaveValue('repo-b');
  });

  it('Should submit a description over 2000 characters whole', async () => {
    const {props} = setup();
    const long = 'a'.repeat(2001);
    fireEvent.change(screen.getByLabelText('Descrição'), {
      target: {value: long},
    });
    await userEvent
      .setup()
      .click(screen.getByRole('button', {name: 'Iniciar'}));
    expect(props.onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({description: long}),
    );
  });

  it('Should fall back to the first repo without a default', () => {
    setup({defaultRepoId: null});
    expect(screen.getByLabelText('Repositório')).toHaveValue('repo-a');
  });

  it('Should disable Iniciar while the description is blank', async () => {
    setup();
    const start = screen.getByRole('button', {name: 'Iniciar'});
    expect(start).toBeDisabled();
    await userEvent.setup().type(screen.getByLabelText('Descrição'), '   ');
    expect(start).toBeDisabled();
  });

  it('Should submit the selected repo and the description', async () => {
    const user = userEvent.setup();
    const {props} = setup();
    await user.selectOptions(screen.getByLabelText('Repositório'), 'repo-a');
    await user.type(screen.getByLabelText('Descrição'), ' corrigir bug ');
    await user.click(screen.getByRole('button', {name: 'Iniciar'}));
    expect(props.onSubmit).toHaveBeenCalledWith({
      repoId: 'repo-a',
      description: 'corrigir bug',
      branch: 'corrigir-bug',
      model: null,
      attachments: [],
    });
  });

  it('Should submit with Cmd+Enter', async () => {
    const user = userEvent.setup();
    const {props} = setup();
    await user.type(screen.getByLabelText('Descrição'), 'tarefa');
    await user.keyboard('{Meta>}{Enter}{/Meta}');
    expect(props.onSubmit).toHaveBeenCalledWith({
      repoId: 'repo-b',
      description: 'tarefa',
      branch: 'tarefa',
      model: null,
      attachments: [],
    });
  });

  it('Should not submit with Cmd+Enter when blank', async () => {
    const user = userEvent.setup();
    const {props} = setup();
    await user.click(screen.getByLabelText('Descrição'));
    await user.keyboard('{Meta>}{Enter}{/Meta}');
    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  it('Should ignore a plain Enter', async () => {
    const user = userEvent.setup();
    const {props} = setup();
    await user.type(screen.getByLabelText('Descrição'), 'a{Enter}b');
    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  it('Should cancel with Escape and with the button', async () => {
    const user = userEvent.setup();
    const {props} = setup();
    await user.keyboard('{Escape}');
    expect(props.onCancel).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', {name: 'Cancelar'}));
    expect(props.onCancel).toHaveBeenCalledTimes(2);
  });

  it('Should show an error inside the dialog', () => {
    setup({error: 'Repositório não encontrado'});
    expect(screen.getByRole('dialog')).toContainElement(
      screen.getByRole('alert'),
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Repositório não encontrado',
    );
  });

  it('Should fill Branch from the description until it is edited by hand', async () => {
    const user = userEvent.setup();
    setup();
    const branch = screen.getByLabelText('Branch');
    await user.type(screen.getByLabelText('Descrição'), 'Corrigir ação');
    expect(branch).toHaveValue('corrigir-acao');
    await user.clear(branch);
    await user.type(branch, 'meu-branch');
    await user.type(screen.getByLabelText('Descrição'), ' extra');
    expect(branch).toHaveValue('meu-branch');
  });

  it('Should offer the models and submit the chosen one', async () => {
    const user = userEvent.setup();
    const {props} = setup();
    const model = screen.getByLabelText('Modelo');
    expect(
      Array.from(model.querySelectorAll('option'), o => o.textContent),
    ).toEqual(['Padrão do Claude Code', 'opus', 'sonnet', 'haiku']);
    await user.selectOptions(model, 'sonnet');
    await user.type(screen.getByLabelText('Descrição'), 'x');
    await user.click(screen.getByRole('button', {name: 'Iniciar'}));
    expect(props.onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({model: 'sonnet'}),
    );
  });

  it('Should disable Iniciar with an empty branch', async () => {
    const user = userEvent.setup();
    setup();
    const start = screen.getByRole('button', {name: 'Iniciar'});
    await user.type(screen.getByLabelText('Descrição'), '###');
    expect(screen.getByLabelText('Branch')).toHaveValue('');
    expect(start).toBeDisabled();
  });

  it('Should not submit with Cmd+Enter while the branch is empty', async () => {
    const user = userEvent.setup();
    const {props} = setup();
    await user.type(screen.getByLabelText('Descrição'), '###');
    await user.keyboard('{Meta>}{Enter}{/Meta}');
    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  it('Should list dropped Finder files and remove them', async () => {
    const user = userEvent.setup();
    const {props} = setup();
    vi.mocked(window.fly.attachments.pathForFile).mockImplementation(file =>
      file.name === 'ghost' ? '' : `/Users/x/${file.name}`,
    );
    const zone = screen.getByText('Arraste arquivos aqui ou cole uma imagem');
    const files = ['a.md', 'b.png', 'ghost'].map(n => new File(['x'], n));
    fireEvent.dragOver(zone);
    fireEvent.drop(zone, {dataTransfer: {files}});
    expect(screen.getByText('/Users/x/a.md')).toBeInTheDocument();
    expect(screen.getByText('/Users/x/b.png')).toBeInTheDocument();
    expect(screen.getAllByRole('button', {name: 'Remover'})).toHaveLength(2);
    await user.click(screen.getAllByRole('button', {name: 'Remover'})[0]!);
    expect(screen.queryByText('/Users/x/a.md')).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Descrição'), 'x');
    await user.click(screen.getByRole('button', {name: 'Iniciar'}));
    expect(props.onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({attachments: ['/Users/x/b.png']}),
    );
  });

  it('Should ignore a drop without files', () => {
    setup();
    fireEvent.drop(
      screen.getByText('Arraste arquivos aqui ou cole uma imagem'),
    );
    expect(screen.queryByRole('button', {name: 'Remover'})).toBeNull();
  });

  it('Should add the paths picked with Anexar arquivos, skipping duplicates', async () => {
    const user = userEvent.setup();
    const {props} = setup();
    vi.mocked(window.fly.tasks.pickAttachments)
      .mockResolvedValueOnce(['/p/1.md', '/p/2.md'])
      .mockResolvedValueOnce(['/p/2.md', '/p/3.md']);
    await user.click(screen.getByRole('button', {name: 'Anexar arquivos'}));
    await screen.findByText('/p/2.md');
    await user.click(screen.getByRole('button', {name: 'Anexar arquivos'}));
    await screen.findByText('/p/3.md');
    await user.type(screen.getByLabelText('Descrição'), 'x');
    await user.click(screen.getByRole('button', {name: 'Iniciar'}));
    expect(props.onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: ['/p/1.md', '/p/2.md', '/p/3.md'],
      }),
    );
  });

  it('Should save a pasted image and list its path', async () => {
    setup();
    vi.mocked(window.fly.attachments.saveImage).mockResolvedValue('/tmp/i.png');
    const image = new File([new Uint8Array([1, 2])], 'i.png', {
      type: 'image/png',
    });
    Object.defineProperty(image, 'arrayBuffer', {
      value: async () => new Uint8Array([1, 2]).buffer,
    });
    fireEvent.paste(screen.getByRole('dialog'), {
      clipboardData: {files: [image, new File(['t'], 't.txt')]},
    });
    expect(await screen.findByText('/tmp/i.png')).toBeInTheDocument();
    expect(window.fly.attachments.saveImage).toHaveBeenCalledTimes(1);
  });

  it('Should leave a paste without an image alone', async () => {
    setup();
    fireEvent.paste(screen.getByRole('dialog'), {
      clipboardData: {files: [new File(['t'], 't.txt')]},
    });
    fireEvent.paste(screen.getByRole('dialog'));
    expect(window.fly.attachments.saveImage).not.toHaveBeenCalled();
  });

  it('Should ignore a failed image save', async () => {
    setup();
    vi.mocked(window.fly.attachments.saveImage).mockRejectedValue(
      new Error('x'),
    );
    const image = new File(['x'], 'i.png', {type: 'image/png'});
    Object.defineProperty(image, 'arrayBuffer', {
      value: async () => new ArrayBuffer(1),
    });
    fireEvent.paste(screen.getByRole('dialog'), {
      clipboardData: {files: [image]},
    });
    await waitFor(() =>
      expect(window.fly.attachments.saveImage).toHaveBeenCalled(),
    );
    expect(screen.queryByRole('button', {name: 'Remover'})).toBeNull();
  });
});

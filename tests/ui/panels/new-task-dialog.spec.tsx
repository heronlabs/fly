import {render, screen} from '@testing-library/react';
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

  it('Should cap the description at 2000 characters', () => {
    setup();
    expect(screen.getByLabelText('Descrição')).toHaveAttribute(
      'maxlength',
      '2000',
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
});

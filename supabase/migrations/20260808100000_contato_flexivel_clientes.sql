-- Phase 5: Contato flexível no booking
-- Permite agendamentos com WhatsApp OU E-mail (ou ambos).
-- 1. Torna `telefone` opcional (DROP NOT NULL)
-- 2. Adiciona CHECK (telefone IS NOT NULL OR email IS NOT NULL)
-- 3. Adiciona índice parcial por email por tenant
-- 4. Atualiza a RPC reaproveitar_ou_criar_cliente para suportar lookup por WhatsApp (1º) e por E-mail (2º)

ALTER TABLE public.clientes ALTER COLUMN telefone DROP NOT NULL;

ALTER TABLE public.clientes
  ADD CONSTRAINT ck_clientes_contato_obrigatorio
  CHECK (telefone IS NOT NULL OR email IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_clientes_tenant_email
  ON public.clientes (tenant_id, lower(email))
  WHERE email IS NOT NULL;

CREATE OR REPLACE FUNCTION public.reaproveitar_ou_criar_cliente(
    p_tenant_id text,
    p_telefone text,
    p_nome text,
    p_email text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
    v_cliente_id uuid;
BEGIN
    -- 1. Busca por WhatsApp se informado (normalizado)
    IF p_telefone IS NOT NULL AND p_telefone <> '' THEN
        SELECT id INTO v_cliente_id
        FROM public.clientes
        WHERE tenant_id = p_tenant_id AND telefone = p_telefone
        LIMIT 1;
    END IF;

    -- 2. Busca por E-mail se não achou por telefone e email informado
    IF v_cliente_id IS NULL AND p_email IS NOT NULL AND p_email <> '' THEN
        SELECT id INTO v_cliente_id
        FROM public.clientes
        WHERE tenant_id = p_tenant_id AND lower(email) = lower(p_email)
        LIMIT 1;
    END IF;

    -- 3. Se encontrou, atualiza dados que estavam ausentes no banco
    IF v_cliente_id IS NOT NULL THEN
        UPDATE public.clientes
        SET nome     = COALESCE(public.clientes.nome, p_nome),
            telefone = COALESCE(public.clientes.telefone, p_telefone),
            email    = COALESCE(public.clientes.email, p_email)
        WHERE id = v_cliente_id;
        
        RETURN v_cliente_id;
    END IF;

    -- 4. Se não encontrou, insere novo cliente
    INSERT INTO public.clientes (tenant_id, telefone, nome, email)
    VALUES (p_tenant_id, p_telefone, p_nome, p_email)
    RETURNING id INTO v_cliente_id;

    RETURN v_cliente_id;
EXCEPTION WHEN unique_violation THEN
    -- Trata concorrência simultânea (race condition de inserções simultâneas)
    IF p_telefone IS NOT NULL AND p_telefone <> '' THEN
        SELECT id INTO v_cliente_id FROM public.clientes WHERE tenant_id = p_tenant_id AND telefone = p_telefone LIMIT 1;
    END IF;
    IF v_cliente_id IS NULL AND p_email IS NOT NULL AND p_email <> '' THEN
        SELECT id INTO v_cliente_id FROM public.clientes WHERE tenant_id = p_tenant_id AND lower(email) = lower(p_email) LIMIT 1;
    END IF;
    RETURN v_cliente_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.reaproveitar_ou_criar_cliente(text, text, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.reaproveitar_ou_criar_cliente(text, text, text, text) TO authenticated, service_role;

COMMENT ON CONSTRAINT ck_clientes_contato_obrigatorio ON public.clientes IS
'Garante que todo cliente possua pelo menos um meio de contato ativo (telefone ou e-mail). Requisito BOO-01.';

COMMENT ON FUNCTION public.reaproveitar_ou_criar_cliente(text, text, text, text) IS
'Upsert atômico de clientes no booking público: busca primeiro por telefone e em seguida por e-mail no mesmo tenant. Atualiza dados faltantes ou cria novo cliente caso não exista.';

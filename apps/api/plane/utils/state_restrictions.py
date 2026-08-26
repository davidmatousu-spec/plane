# Per-user State restrictions.
#
# Users listed here (matched by email, case-insensitive) see ONLY the states
# whose IDs are in their allowlist: the states endpoint returns just those
# states, and every issue endpoint returns only issues in those states.
# Users not listed here are completely unaffected.

RESTRICTED_STATE_USERS = {
    "tomas.slama@onixia-pasport.cz": [
        "f8a976f5-2152-43f5-b36a-cc61bc9d71c6",  # Schůzka (domluvený termín)
        "a1cb9cc0-825d-43b9-a10f-6d00e3d99156",  # Vytvořit zakázku
        "dad2e6f5-b80b-4c3b-8b33-5f43bc5fa6cc",  # LEAD
    ],
}


def get_allowed_state_ids(user):
    """Return the allowed state ID list for the user, or None if unrestricted."""
    email = getattr(user, "email", None)
    if not email:
        return None
    return RESTRICTED_STATE_USERS.get(email.lower())


def filter_states_for_user(queryset, user):
    """Limit a State queryset to the user's allowed states (no-op for unrestricted users)."""
    allowed = get_allowed_state_ids(user)
    if allowed is None:
        return queryset
    return queryset.filter(id__in=allowed)


def filter_issues_for_user(queryset, user):
    """Limit an Issue queryset to issues in the user's allowed states (no-op for unrestricted users)."""
    allowed = get_allowed_state_ids(user)
    if allowed is None:
        return queryset
    return queryset.filter(state_id__in=allowed)


def is_state_allowed_for_user(user, state_id):
    """Whether the user may reference the given state (always True for unrestricted users)."""
    allowed = get_allowed_state_ids(user)
    if allowed is None:
        return True
    return str(state_id) in allowed

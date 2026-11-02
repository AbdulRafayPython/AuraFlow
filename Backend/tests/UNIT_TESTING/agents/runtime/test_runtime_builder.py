"""Agent Builder service layer: validation, permissions, quotas and SQL; plus templates and the generator."""
from __future__ import annotations

import json

import pytest

from runtime_fakes import make_db  # noqa: F401  (pytest fixture)
from agents.runtime import builder, generator
from agents.runtime.builder import BuilderError, validate_fields, validate_triggers
from agents.runtime.definitions import AgentDefinition, TriggerDef
from agents.runtime.schedules import MIN_INTERVAL_MINUTES
from agents.runtime.templates import BLANK, TEMPLATES, get_template, list_templates

MOD = []                      # builder works on a cursor it is given; no connection to patch
READ_TOOLS = set(builder.allowed_tool_names())


def defn(**kw):
    base = dict(id=2, public_id="pub-2", bot_user_id=502, bot_username="faq_bot", name="FAQ Bot",
                owner_user_id=4, community_id=3, status="active", version=3,
                instructions="Answer FAQs.", tools=("search_knowledge",),
                triggers=(TriggerDef(id=1, type="mention"),))
    base.update(kw)
    return AgentDefinition(**base)


# ── tool catalog ────────────────────────────────────────────────────────

def test_catalog_offers_read_and_write_tools_but_never_admin():
    assert {"get_channel_history", "search_knowledge", "translate_text"} <= READ_TOOLS
    risks = {t["name"]: t["risk"] for t in builder.tool_catalog()}
    assert risks["search_knowledge"] == "read" and risks["post_message"] == "write"
    assert "admin" not in risks.values()


def test_write_tools_can_be_attached_but_admin_tools_cannot(monkeypatch):
    from agents.runtime import tools as rt
    clean, errors = validate_fields({"tools": ["post_message"]}, partial=True)
    assert errors == [] and clean["tools"] == ["post_message"]
    monkeypatch.setitem(rt.TOOL_REGISTRY, "ban_user",
                        rt.Tool("ban_user", "d", {"type": "object", "properties": {}}, "admin", lambda c: 1))
    _, errors = validate_fields({"tools": ["ban_user"]}, partial=True)
    assert errors and "not allowed" in errors[0]


# ── fields ──────────────────────────────────────────────────────────────

VALID = {"name": "FAQ Bot", "instructions": "Answer questions about fees.", "tools": ["search_knowledge"]}


def test_valid_agent_passes_and_is_cleaned():
    clean, errors = validate_fields({**VALID, "name": "  FAQ Bot  ", "description": "d" * 999,
                                     "tools": ["search_knowledge", "search_knowledge"], "model_tier": "smart",
                                     "daily_run_cap": 10, "permissions": {"channel_ids": [3, 1, 3]}})
    assert errors == []
    assert clean["name"] == "FAQ Bot" and len(clean["description"]) == builder.MAX_DESCRIPTION
    assert clean["tools"] == ["search_knowledge"]
    assert clean["permissions"] == {"channel_ids": [1, 3]}
    assert (clean["model_tier"], clean["daily_run_cap"]) == ("smart", 10)


@pytest.mark.parametrize("field,value", [
    ("name", "x"), ("name", "x" * 61), ("name", ""), ("instructions", "short"),
    ("instructions", "x" * 4001), ("model_tier", "turbo"), ("tools", "search_knowledge"),
    ("tools", ["nope"]), ("tools", ["search_knowledge"] * 13 + ["get_member_info"]),
    ("daily_run_cap", 0), ("daily_run_cap", 5000), ("daily_run_cap", True), ("daily_run_cap", "10"),
    ("permissions", {"channel_ids": "1"}), ("permissions", {"channel_ids": [True]}), ("permissions", []),
    ("avatar_url", "javascript:alert(1)"), ("avatar_url", "http://insecure.example/a.png"),
])
def test_invalid_fields_are_rejected(field, value):
    _, errors = validate_fields({**VALID, field: value})
    assert errors


def test_create_requires_name_and_instructions_but_patch_does_not():
    assert len(validate_fields({})[1]) == 2
    assert validate_fields({}, partial=True) == ({}, [])
    assert validate_fields({"description": "just this"}, partial=True)[0] == {"description": "just this"}


def test_avatar_accepts_uploads_and_https():
    assert validate_fields({"avatar_url": "/uploads/a.png"}, partial=True)[1] == []
    assert validate_fields({"avatar_url": "https://cdn.example/a.png"}, partial=True)[1] == []
    assert validate_fields({"avatar_url": ""}, partial=True)[0] == {"avatar_url": None}


# ── triggers ────────────────────────────────────────────────────────────

def trig(triggers, community_id=3, channel_ok=lambda c: True):
    return validate_triggers(triggers, community_id=community_id, channel_ok=channel_ok)


def test_mention_trigger():
    out, errors = trig([{"type": "mention"}])
    assert errors == [] and out == [{"type": "mention", "channel_id": None, "config": {}, "next_run_at": None,
                                     "enabled": True}]


def test_keyword_trigger_needs_keywords():
    assert trig([{"type": "keyword", "config": {"keywords": [" fees ", "deadline"]}}])[0][0]["config"] == \
        {"keywords": ["fees", "deadline"]}
    for bad in ({}, {"keywords": []}, {"keywords": [""]}, {"keywords": [5]}, {"keywords": ["x" * 41]},
                {"keywords": ["k"] * 21}):
        assert trig([{"type": "keyword", "config": bad}])[1]


def test_schedule_trigger_is_validated_and_gets_a_next_run():
    out, errors = trig([{"type": "schedule", "channel_id": 11, "config": {"cron": "0 17 * * 5", "tz": "Asia/Dubai"}}])
    assert errors == [] and out[0]["config"]["tz"] == "Asia/Dubai" and out[0]["next_run_at"] is not None


def test_schedule_needs_a_channel_a_valid_cron_and_a_sane_frequency():
    assert "channel" in trig([{"type": "schedule", "config": {"cron": "0 9 * * *"}}])[1][0]
    assert trig([{"type": "schedule", "channel_id": 11, "config": {"cron": "nonsense"}}])[1]
    assert str(MIN_INTERVAL_MINUTES) in trig([{"type": "schedule", "channel_id": 11,
                                               "config": {"cron": "* * * * *"}}])[1][0]


def test_channel_message_must_be_pinned_to_a_channel():
    assert trig([{"type": "channel_message"}])[1]
    assert trig([{"type": "channel_message", "channel_id": 11}])[1] == []


def test_member_joined_is_only_for_community_agents():
    assert trig([{"type": "member_joined"}], community_id=None)[1]
    assert trig([{"type": "member_joined"}], community_id=3)[1] == []


def test_channels_must_pass_the_access_check():
    out, errors = trig([{"type": "mention", "channel_id": 99}], channel_ok=lambda c: c != 99)
    assert out == [] and "channel_id" in errors[0]
    assert trig([{"type": "mention", "channel_id": "11"}])[1]
    assert trig([{"type": "mention", "channel_id": True}])[1]


def test_bad_trigger_shapes():
    assert trig("mention")[1] and trig([{"type": "telepathy"}])[1] and trig(["mention"])[1]
    assert trig([{"type": "mention"}] * 11)[1]


def test_disabled_flag_is_kept():
    assert trig([{"type": "mention", "enabled": False}])[0][0]["enabled"] is False


# ── permissions ─────────────────────────────────────────────────────────

def roles(make_db, role=None, sysadmin=False):
    return make_db([("FROM community_members", {"role": role} if role else None),
                    ("role = 'system_admin'", {"x": 1} if sysadmin else None)], MOD)[1]


@pytest.mark.parametrize("role,expected", [("owner", True), ("admin", True), ("member", False), (None, False)])
def test_only_community_owners_and_admins_can_create(make_db, role, expected):
    assert builder.can_create(roles(make_db, role), 4, 3) is expected


def test_anyone_can_create_a_personal_agent_and_sysadmins_anything(make_db):
    assert builder.can_create(roles(make_db), 4, None) is True
    assert builder.can_create(roles(make_db, None, sysadmin=True), 4, 3) is True


def test_manage_rules(make_db):
    mine = defn(owner_user_id=4)
    assert builder.can_manage(roles(make_db), 4, mine) is True                      # owner
    assert builder.can_manage(roles(make_db, "admin"), 9, mine) is True             # community admin
    assert builder.can_manage(roles(make_db, "member"), 9, mine) is False
    assert builder.can_manage(roles(make_db, None, sysadmin=True), 9, mine) is True
    personal = defn(community_id=None, owner_user_id=4)
    assert builder.can_manage(roles(make_db, "owner"), 9, personal) is False        # not their agent


def test_builtin_agent_is_manageable_only_by_system_admins(make_db):
    aura = defn(template_key="aura", owner_user_id=4)
    assert builder.can_manage(roles(make_db), 4, aura) is False
    assert builder.can_manage(roles(make_db, None, sysadmin=True), 4, aura) is True


def test_view_rules(make_db):
    active = defn(status="active")
    assert builder.can_view(roles(make_db, "member"), 9, active) is True            # members see active agents
    assert builder.can_view(roles(make_db, None), 9, active) is False               # outsiders do not
    assert builder.can_view(roles(make_db, "member"), 9, defn(status="draft")) is False
    assert builder.can_view(roles(make_db), 4, defn(status="draft", owner_user_id=4)) is True


def test_channel_checker_requires_same_community_and_membership(make_db):
    _, cur = make_db([("FROM channels WHERE id", lambda s, p: {"community_id": 3 if p[0] == 11 else 4}),
                      ("FROM channel_members", lambda s, p: {"x": 1} if p == (11, 4) else None),
                      ("role = 'system_admin'", None)], MOD)
    ok = builder.channel_checker(cur, 4, 3)
    assert ok(11) is True
    assert ok(12) is False                       # another community
    assert builder.channel_checker(cur, 5, 3)(11) is False   # not a member


def test_channel_checker_for_unknown_channel(make_db):
    _, cur = make_db([("FROM channels WHERE id", None)], MOD)
    assert builder.channel_checker(cur, 4, 3)(1) is False


# ── quotas ──────────────────────────────────────────────────────────────

def test_quota_blocks_the_sixth_agent(make_db):
    _, cur = make_db([("WHERE owner_user_id", {"n": 5})], MOD)
    with pytest.raises(BuilderError) as e:
        builder.check_quota(cur, 4, None)
    assert e.value.status == 409 and "maximum of 5" in e.value.message


def test_quota_is_configurable(make_db, monkeypatch):
    monkeypatch.setenv("AGENT_MAX_PER_USER", "2")
    _, cur = make_db([("WHERE owner_user_id", {"n": 2})], MOD)
    with pytest.raises(BuilderError, match="maximum of 2"):
        builder.check_quota(cur, 4, None)


def test_community_quota(make_db):
    _, cur = make_db([("WHERE owner_user_id", {"n": 0}), ("WHERE community_id", {"n": 10})], MOD)
    with pytest.raises(BuilderError, match="community"):
        builder.check_quota(cur, 4, 3)


def test_under_quota_passes(make_db):
    _, cur = make_db([("WHERE owner_user_id", {"n": 1}), ("WHERE community_id", {"n": 1})], MOD)
    builder.check_quota(cur, 4, 3)


# ── writes ──────────────────────────────────────────────────────────────

def test_create_agent_inserts_bot_definition_and_triggers(make_db):
    _, cur = make_db([("SELECT 1 FROM users", None)], ["agents.runtime.definitions"], lastrowid=20)
    fields = {"name": "FAQ Bot", "description": "d", "instructions": "Answer FAQs.", "tools": ["search_knowledge"],
              "model_tier": "fast", "permissions": {"channel_ids": [11]}, "daily_run_cap": 50}
    triggers = [{"type": "keyword", "channel_id": None, "config": {"keywords": ["fees"]}, "next_run_at": None,
                 "enabled": True}]
    agent_id, public_id = builder.create_agent(cur, owner_id=4, community_id=3, fields=fields,
                                               triggers=triggers, template_key="faq")
    assert agent_id == 20 and len(public_id) == 36
    bot = cur.sql_containing("INSERT INTO users")[0]
    assert bot[1][1] == "faq_bot" and "is_bot" in bot[0]                     # slug of the name
    sql, p = cur.sql_containing("INSERT INTO agent_definitions")[0]
    assert "'draft'" in sql                                                  # never live until published
    assert p[2:4] == (4, 3) and json.loads(p[9]) == ["search_knowledge"] and json.loads(p[10]) == {"channel_ids": [11]}
    assert p[11] == "faq" and p[12] == 50
    t = cur.sql_containing("INSERT INTO agent_triggers")[0][1]
    assert t[1] == "keyword" and json.loads(t[3]) == {"keywords": ["fees"]}


def test_mention_trigger_is_stored_with_null_config(make_db):
    _, cur = make_db([], MOD)
    builder.insert_triggers(cur, 2, [{"type": "mention", "config": {}, "enabled": True}])
    assert cur.executed[0][1][3] is None


def test_slugify():
    assert builder.slugify("FAQ Bot!") == "faq_bot"
    assert builder.slugify("  ***  ") == "agent"
    assert builder.slugify("Digest — Weekly") == "digest_weekly"


def test_update_bumps_version_and_encodes_json(make_db):
    _, cur = make_db([], MOD)
    builder.update_agent(cur, 2, {"name": "New", "tools": ["translate_text"], "daily_run_cap": 9})
    sql, params = cur.sql_containing("UPDATE agent_definitions SET")[0]
    assert "version = version + 1" in sql and params[-1] == 2
    assert json.dumps(["translate_text"]) in params
    assert cur.sql_containing("SET u.display_name")[0][1] == ("New", 2)        # the bot user is renamed too


def test_empty_update_writes_nothing(make_db):
    _, cur = make_db([], MOD)
    builder.update_agent(cur, 2, {})
    assert cur.executed == []


def test_replace_triggers_swaps_the_whole_set(make_db):
    _, cur = make_db([], MOD)
    builder.replace_triggers(cur, 2, [{"type": "mention", "config": {}}])
    kinds = [s.split()[0] for s, _ in cur.executed]
    assert kinds[0] == "DELETE" and "INSERT" in kinds[1] and "UPDATE" in kinds[2]


def test_archiving_silences_and_suspends_the_agent(make_db):
    _, cur = make_db([], MOD)
    builder.set_status(cur, defn(), "archived")
    assert cur.sql_containing("SET enabled = 0")
    assert cur.sql_containing("account_status = 'suspended'")[0][1] == (502,)


def test_publishing_reactivates_the_bot_user(make_db):
    _, cur = make_db([], MOD)
    builder.set_status(cur, defn(status="paused"), "active")
    assert cur.sql_containing("account_status = 'active'")


# ── output ──────────────────────────────────────────────────────────────

def test_owner_view_includes_configuration():
    out = builder.serialize(defn(), community_public_id="comm-1")
    assert out["id"] == "pub-2" and out["username"] == "faq_bot" and out["community_id"] == "comm-1"
    assert out["instructions"] == "Answer FAQs." and out["version"] == 3
    assert out["triggers"] == [{"id": 1, "type": "mention", "channel_id": None, "config": {}, "enabled": True}]


def test_public_view_hides_instructions_and_triggers():
    out = builder.serialize(defn(), include_private=False)
    assert "instructions" not in out and "triggers" not in out and "tools" not in out
    assert out["name"] == "FAQ Bot"


# ── templates ───────────────────────────────────────────────────────────

@pytest.mark.parametrize("tpl", list(TEMPLATES.values()) + [BLANK], ids=lambda t: t.key)
def test_every_template_produces_a_valid_agent(tpl):
    clean, errors = validate_fields({"name": tpl.suggested_name, "instructions": tpl.instructions,
                                     "tools": list(tpl.tools), "model_tier": tpl.model_tier,
                                     "description": tpl.description})
    assert errors == []
    assert set(tpl.tools) <= READ_TOOLS


@pytest.mark.parametrize("tpl", list(TEMPLATES.values()) + [BLANK], ids=lambda t: t.key)
def test_every_template_trigger_is_valid_once_a_channel_is_given(tpl):
    triggers = [dict(t, channel_id=11) if t["type"] == "schedule" else dict(t) for t in tpl.triggers]
    out, errors = trig(triggers, community_id=None if tpl.personal_only else 3)
    assert errors == [] and out


def test_scheduled_templates_declare_that_they_need_a_channel():
    for t in TEMPLATES.values():
        has_schedule = any(tr["type"] == "schedule" for tr in t.triggers)
        assert t.needs_channel is has_schedule


def test_template_listing_is_json_serialisable_and_complete():
    items = list_templates()
    json.dumps(items)
    assert {i["key"] for i in items} == {"faq", "welcome", "digest", "standup", "booster", "recap", "translator", "knowledge", "wellbeing",
                    "blank"}
    assert get_template("blank") is BLANK


def test_faq_template_is_grounded_in_knowledge():
    faq = get_template("faq")
    assert faq.tools == ("search_community_knowledge", "search_knowledge") and "ONLY" in faq.instructions


# ── generator ───────────────────────────────────────────────────────────

class FakeClient:
    def __init__(self, reply):
        self.reply, self.calls = reply, []

    def complete_json(self, prompt, **kw):
        self.calls.append((prompt, kw))
        return self.reply


def test_generate_returns_a_sanitised_draft():
    reply = {"name": "Fee Helper", "description": "Answers fee questions", "instructions": "You are Fee Helper. Be brief.",
             "tools": ["search_knowledge", "delete_everything", "search_knowledge"],
             "triggers": [{"type": "keyword", "config": {"keywords": ["fees", "", 7]}},
                          {"type": "schedule", "config": {"cron": "* * * * *"}}]}
    client = FakeClient(reply)
    out = generator.generate_draft("an agent that answers fee questions", client=client)
    d = out["draft"]
    assert d["tools"] == ["search_knowledge"]
    assert d["triggers"] == [{"type": "keyword", "config": {"keywords": ["fees"]}}]
    assert any("delete_everything" in n for n in out["notes"]) and any("schedule" in n.lower() for n in out["notes"])
    assert "search_knowledge" in client.calls[0][1]["system"]            # the model is told the real tool names


def test_generate_fills_gaps_and_always_keeps_a_way_to_talk_to_the_agent():
    d = generator.sanitize_draft({"name": "", "instructions": "", "tools": "oops", "triggers": []})["draft"]
    assert d["name"] == "My Agent" and len(d["instructions"]) >= 10 and d["triggers"] == [{"type": "mention"}]


def test_generate_truncates_oversized_model_output():
    d = generator.sanitize_draft({"name": "n" * 300, "instructions": "i" * 9000, "description": "d" * 900})["draft"]
    assert len(d["name"]) == builder.MAX_NAME and len(d["instructions"]) == builder.MAX_INSTRUCTIONS
    assert len(d["description"]) == builder.MAX_DESCRIPTION


def test_generated_drafts_pass_the_builders_own_validation():
    d = generator.sanitize_draft({"name": "Helper", "instructions": "You help people.",
                                  "tools": ["get_member_info"], "triggers": [{"type": "member_joined"}]})["draft"]
    assert validate_fields({k: d[k] for k in ("name", "description", "instructions", "tools")})[1] == []
    assert trig(d["triggers"])[1] == []


def test_generate_needs_a_real_description():
    with pytest.raises(ValueError):
        generator.generate_draft("hi", client=FakeClient({}))


def test_generate_reports_an_unusable_model_answer():
    with pytest.raises(generator.GenerationUnavailable):
        generator.generate_draft("an agent for fees please", client=FakeClient(None))


def test_generate_without_an_llm_is_unavailable(monkeypatch):
    from utils.ai import model_router
    monkeypatch.setattr(model_router, "get_llm_client", lambda: None)
    with pytest.raises(generator.GenerationUnavailable, match="not configured"):
        generator.generate_draft("an agent for fees please")

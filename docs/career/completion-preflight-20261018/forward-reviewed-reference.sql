-- SOURCE ONLY, OWNER REVIEW REQUIRED. No connection or allowance is configured.
-- Draft without --catalog refuses before permanent mutation. No DROP/TRUNCATE or customer-row DML.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
SET LOCAL search_path=pg_catalog,public;
SELECT pg_advisory_xact_lock(hashtextextended('upmore:career-forward-upgrade:v1',0));
DO $forward$
DECLARE observed jsonb; expected jsonb:='{"roles":[{"name":"anon","exists":true,"bypassRLS":false},{"name":"authenticated","exists":true,"bypassRLS":false},{"name":"service_role","exists":true,"bypassRLS":false}],"schemas":[{"name":"auth","owner":"postgres","aclSha":"6e9abca1fdd8564991b445e192fd00047f5bbb933e174906754717864cbde85c"},{"name":"public","owner":"pg_database_owner","aclSha":"c5a6966a33c1b16ee146719e45fc9bf9206f1ec04124d1ce24af1853a0557267"}],"version":"career_forward_catalog/v1","functions":[{"name":"agent_model_call_record","overloads":[{"acl":[{"grantee":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"service_role","grantable":false,"privilege":"EXECUTE"}],"owner":"postgres","strict":false,"bodySha":"83da38acd6e44f6ee831fdfa1faddba550a4eef28e4dbe6bbd64ea27f8cdf1ee","returns":"void","language":"plpgsql","parallel":"u","arguments":"p_call uuid, p_usage jsonb","configSha":"a90d5406c7d8f6b00e8de7e96010c8d845fbd78bf3325ddb6931ef9c21a2dd90","volatility":"v","defaultsSha":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855","definitionSha":"1890c858bb4aa3bcf3522267fab3134141bdff5ef71e22eb8ff8ce7d765eba19","securityDefiner":true}]},{"name":"agent_model_call_reserve","overloads":[{"acl":[{"grantee":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"service_role","grantable":false,"privilege":"EXECUTE"}],"owner":"postgres","strict":false,"bodySha":"613e842e919aa4301ab2518ce42eba665ce76e092efd317b0bf8bad38c91158a","returns":"jsonb","language":"plpgsql","parallel":"u","arguments":"p_user uuid, p_thread uuid, p_request uuid, p_step integer, p_model text","configSha":"a90d5406c7d8f6b00e8de7e96010c8d845fbd78bf3325ddb6931ef9c21a2dd90","volatility":"v","defaultsSha":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855","definitionSha":"2ce575b427b318207489815bc302b4063928c155d2ba7dfd37c1f6f12955da86","securityDefiner":true}]},{"name":"career_applicant_canonical_v1","overloads":[]},{"name":"career_applicant_confirm_turn_v1","overloads":[]},{"name":"career_applicant_equipment_resolve_base_v1","overloads":[]},{"name":"career_applicant_equipment_resolve_v1","overloads":[]},{"name":"career_applicant_resume_confirm_v1","overloads":[]},{"name":"career_applicant_resume_erase_v1","overloads":[]},{"name":"career_applicant_review_v1","overloads":[]},{"name":"career_applicant_status_v1","overloads":[]},{"name":"career_applicant_turn_version_v1","overloads":[]},{"name":"career_applicant_upload_erase_v1","overloads":[]},{"name":"career_applicant_upload_sweep_v1","overloads":[]},{"name":"career_applicant_upload_turn_v1","overloads":[]},{"name":"career_application_admission_history_v1","overloads":[]},{"name":"career_application_admit_v1","overloads":[]},{"name":"career_application_approval_source_guard_v1","overloads":[]},{"name":"career_application_batch_answers_v1","overloads":[]},{"name":"career_application_batch_context_v1","overloads":[]},{"name":"career_application_batch_control_v1","overloads":[]},{"name":"career_application_batch_erase_v1","overloads":[]},{"name":"career_application_batch_lookup_v1","overloads":[]},{"name":"career_application_batch_progress_v1","overloads":[]},{"name":"career_application_batch_queue_v1","overloads":[]},{"name":"career_application_chat_context_v1","overloads":[]},{"name":"career_application_conversation_erase_v1","overloads":[]},{"name":"career_application_profile_confirm_v1","overloads":[]},{"name":"career_application_profile_review_v1","overloads":[]},{"name":"career_application_search_prepare_v1","overloads":[]},{"name":"career_application_search_scope_v1","overloads":[]},{"name":"career_application_search_store_v1","overloads":[]},{"name":"career_application_source_refresh_context_v1","overloads":[]},{"name":"career_application_source_refresh_v1","overloads":[]},{"name":"career_application_task_context_v1","overloads":[]},{"name":"career_host_commit","overloads":[{"acl":[{"grantee":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"service_role","grantable":false,"privilege":"EXECUTE"}],"owner":"postgres","strict":false,"bodySha":"d609c7f483557b9996ec774189ee8e282d5d564dbb85b92fb725d5efa2212fbf","returns":"jsonb","language":"plpgsql","parallel":"u","arguments":"p_user uuid, p_thread uuid, p_key text, p_hash text, p_revision bigint, p_account_version bigint, p_snapshot jsonb, p_patch jsonb, p_input text, p_response jsonb","configSha":"8a99a028247dc2f9ba6a2dad007920a9e88dc640cab71800ebd92d401c25d7c9","volatility":"v","defaultsSha":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855","definitionSha":"c25b4543026a435730efc651123e169667942264caf9090a624db30156c675ef","securityDefiner":false}]},{"name":"career_host_load","overloads":[{"acl":[{"grantee":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"service_role","grantable":false,"privilege":"EXECUTE"}],"owner":"postgres","strict":false,"bodySha":"befeb2adca345b23d010f10bd39afb17ac00e340e6b99bacc6b6f23fbc02567d","returns":"jsonb","language":"plpgsql","parallel":"u","arguments":"p_user uuid, p_thread uuid, p_key text, p_hash text","configSha":"8a99a028247dc2f9ba6a2dad007920a9e88dc640cab71800ebd92d401c25d7c9","volatility":"v","defaultsSha":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855","definitionSha":"cc14e27a5f7e8997f474a826e8bdf3d30618016330c22addd4a98be5d70e999a","securityDefiner":false}]},{"name":"career_journey_action_claim_v1","overloads":[]},{"name":"career_journey_action_read_v1","overloads":[]},{"name":"career_journey_artifact_open_v1","overloads":[]},{"name":"career_journey_artifact_scope_v1","overloads":[]},{"name":"career_journey_checker_prepare_v1","overloads":[]},{"name":"career_journey_context_basis_v1","overloads":[]},{"name":"career_journey_context_commit_v1","overloads":[]},{"name":"career_journey_context_content_v1","overloads":[]},{"name":"career_journey_context_cursor_v1","overloads":[]},{"name":"career_journey_context_load_v2","overloads":[]},{"name":"career_journey_context_read_v1","overloads":[]},{"name":"career_journey_context_refresh_commit_v1","overloads":[]},{"name":"career_journey_context_refresh_load_v1","overloads":[]},{"name":"career_journey_execution_fence_v1","overloads":[]},{"name":"career_journey_leg_consume_v1","overloads":[]},{"name":"career_journey_observe_v1","overloads":[]},{"name":"career_journey_outcome_record_v1","overloads":[]},{"name":"career_journey_readback_v1","overloads":[]},{"name":"career_journey_turn_commit_v1","overloads":[]},{"name":"career_model_budget_consume_v1","overloads":[]},{"name":"career_model_budget_reserve_v1","overloads":[]},{"name":"career_model_budget_settle_v1","overloads":[]},{"name":"career_model_context_barrier_v2","overloads":[]},{"name":"career_model_context_current_v1","overloads":[]},{"name":"career_model_context_read_v2","overloads":[]},{"name":"career_model_leg_consume_v2","overloads":[]},{"name":"career_model_leg_settle_v2","overloads":[]},{"name":"career_model_pair_read_v2","overloads":[]},{"name":"career_model_pair_reserve_v2","overloads":[]},{"name":"career_model_replay_check_v2","overloads":[]},{"name":"career_native_checker_prepare_v1","overloads":[]},{"name":"career_native_claim_v1","overloads":[]},{"name":"career_native_fence_v1","overloads":[]},{"name":"career_native_leg_consume_v1","overloads":[]},{"name":"career_native_observe_v1","overloads":[]},{"name":"career_native_outcome_v1","overloads":[]},{"name":"career_native_read_v1","overloads":[]},{"name":"career_native_replay_v1","overloads":[]},{"name":"career_native_turn_commit_v1","overloads":[]},{"name":"career_reminder_ack","overloads":[{"acl":[{"grantee":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"service_role","grantable":false,"privilege":"EXECUTE"}],"owner":"postgres","strict":false,"bodySha":"a82ee8325c95251c96ec97f3aab5036941fb6ccea3988d7cc885cb518b5050e6","returns":"jsonb","language":"plpgsql","parallel":"u","arguments":"p_user uuid, p_id text, p_lease uuid, p_record jsonb","configSha":"8a99a028247dc2f9ba6a2dad007920a9e88dc640cab71800ebd92d401c25d7c9","volatility":"v","defaultsSha":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855","definitionSha":"a9b8029174c8ab5f4f9fd67ec35623dad52a4fa5259873d656b73c7fe8083a93","securityDefiner":false}]},{"name":"career_reminder_allowed","overloads":[{"acl":[{"grantee":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"service_role","grantable":false,"privilege":"EXECUTE"}],"owner":"postgres","strict":false,"bodySha":"b8aa2941cd7707f9fbf5299855219dc8fb35c97e2e3227f3d0c6e2d6b030b12b","returns":"boolean","language":"sql","parallel":"u","arguments":"p_user uuid, p_reminder jsonb","configSha":"8a99a028247dc2f9ba6a2dad007920a9e88dc640cab71800ebd92d401c25d7c9","volatility":"v","defaultsSha":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855","definitionSha":"5d2ee86b53da5991ee71bcebbeeeac78b3fcb441eb9532495a71b3a0ca07d1a8","securityDefiner":false}]},{"name":"career_reminder_claim","overloads":[{"acl":[{"grantee":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"service_role","grantable":false,"privilege":"EXECUTE"}],"owner":"postgres","strict":false,"bodySha":"3896550956b7b14a046ed7d28ca406a4828038693579205f48f8ed3aab5d17ed","returns":"jsonb","language":"plpgsql","parallel":"u","arguments":"p_user uuid, p_id text","configSha":"8a99a028247dc2f9ba6a2dad007920a9e88dc640cab71800ebd92d401c25d7c9","volatility":"v","defaultsSha":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855","definitionSha":"7a23fa63c40d2cfc1ae37812abc70561ac5bd14273abcf25491c562a21696031","securityDefiner":false}]},{"name":"career_reminder_enqueue","overloads":[{"acl":[{"grantee":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"service_role","grantable":false,"privilege":"EXECUTE"}],"owner":"postgres","strict":false,"bodySha":"ff1796403665f9927dc48dc04acb898bab4e93e83e1908441dd67726abe6dad9","returns":"jsonb","language":"plpgsql","parallel":"u","arguments":"p_user uuid, p_reminder jsonb, p_version bigint, p_epoch bigint","configSha":"8a99a028247dc2f9ba6a2dad007920a9e88dc640cab71800ebd92d401c25d7c9","volatility":"v","defaultsSha":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855","definitionSha":"4cb50de47bddeb42abdb50edce20b49f357357dd9baefde303f959dcd3e58a76","securityDefiner":false}]},{"name":"career_reminder_list","overloads":[{"acl":[{"grantee":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"service_role","grantable":false,"privilege":"EXECUTE"}],"owner":"postgres","strict":false,"bodySha":"9ed9509c34fa1987ebd34ddc60f062c639253323765ef8826012e35404a1a58a","returns":"jsonb","language":"sql","parallel":"u","arguments":"p_user uuid","configSha":"8a99a028247dc2f9ba6a2dad007920a9e88dc640cab71800ebd92d401c25d7c9","volatility":"v","defaultsSha":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855","definitionSha":"0e1ffc48092cb5361d5a4d0ee497957e0f0de168b0c1014b4c50b7f1d0819906","securityDefiner":false}]},{"name":"career_reminder_status","overloads":[{"acl":[{"grantee":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"service_role","grantable":false,"privilege":"EXECUTE"}],"owner":"postgres","strict":false,"bodySha":"d884bd1b4428b144f6c0c5c08a94021919e183725f653a173f42bc5fa4c916e3","returns":"jsonb","language":"sql","parallel":"u","arguments":"p_user uuid, p_id text","configSha":"8a99a028247dc2f9ba6a2dad007920a9e88dc640cab71800ebd92d401c25d7c9","volatility":"v","defaultsSha":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855","definitionSha":"fb66d4e2c608bd367d499209c17e065a75bb878390e7c20ef6f6dee50b9b77c2","securityDefiner":false}]},{"name":"career_task_account_v1","overloads":[{"acl":[{"grantee":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"service_role","grantable":false,"privilege":"EXECUTE"}],"owner":"postgres","strict":false,"bodySha":"39124b00e2e8127b8b1923f28a69bd3e3a0a70d865b9c3c95d5d00e4d51a8050","returns":"jsonb","language":"sql","parallel":"u","arguments":"p_user uuid","configSha":"8a99a028247dc2f9ba6a2dad007920a9e88dc640cab71800ebd92d401c25d7c9","volatility":"v","defaultsSha":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855","definitionSha":"4916cca8f004c1ab5e458e6ab8f35c3129c448fc5e96bfc2b181858bdc7e1796","securityDefiner":false}]},{"name":"career_task_begin_effect_v1","overloads":[{"acl":[{"grantee":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"service_role","grantable":false,"privilege":"EXECUTE"}],"owner":"postgres","strict":false,"bodySha":"21f36b17ee9af21b15d78ca6cbc58a119307aa6aaec5080c8398cba361ce7ee9","returns":"jsonb","language":"plpgsql","parallel":"u","arguments":"p_user uuid, p_intent text, p_lease uuid, p_task text, p_operation text, p_effect_key text, p_bindings jsonb","configSha":"8a99a028247dc2f9ba6a2dad007920a9e88dc640cab71800ebd92d401c25d7c9","volatility":"v","defaultsSha":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855","definitionSha":"ca7a57b38132097bf46d35326711c76c8084f559c03482bb91c2e8012ab3aa1d","securityDefiner":false}]},{"name":"career_task_claim_owned_v1","overloads":[]},{"name":"career_task_claim_readback_v1","overloads":[]},{"name":"career_task_claim_v1","overloads":[{"acl":[{"grantee":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"service_role","grantable":false,"privilege":"EXECUTE"}],"owner":"postgres","strict":false,"bodySha":"f2a124868601e80a6aabbe968dc0acd0b2eafdd7978786b7ce4ed3ee7ee05ba4","returns":"jsonb","language":"plpgsql","parallel":"u","arguments":"p_user uuid, p_intent text, p_task text, p_lease uuid","configSha":"8a99a028247dc2f9ba6a2dad007920a9e88dc640cab71800ebd92d401c25d7c9","volatility":"v","defaultsSha":"4385a67c7204ff8b2cea0aeef7c4f7a7396230440bad0ad1ec2d0bbe91018a56","definitionSha":"50f32e0008d7f9aae332a5f2e63edc84da502592baf92cd44b21e7d53b36c5c3","securityDefiner":false}]},{"name":"career_task_consume_effect_v1","overloads":[{"acl":[{"grantee":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"service_role","grantable":false,"privilege":"EXECUTE"}],"owner":"postgres","strict":false,"bodySha":"4e681efecbd619d3cd0efdc159bce23f7fd374a5cac7a4f1fd8f15323d23a615","returns":"jsonb","language":"plpgsql","parallel":"u","arguments":"p_user uuid, p_token uuid","configSha":"8a99a028247dc2f9ba6a2dad007920a9e88dc640cab71800ebd92d401c25d7c9","volatility":"v","defaultsSha":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855","definitionSha":"1893a3c6c2aa2051a6db336133accdfe2fd1a3aca7bc3151e8dc494775460ced","securityDefiner":false}]},{"name":"career_task_control_hook_v1","overloads":[{"acl":[{"grantee":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"service_role","grantable":false,"privilege":"EXECUTE"}],"owner":"postgres","strict":false,"bodySha":"5bac0f341177cb81b4c5e18a7b482eab325b73eb5109b73418de2c181a748214","returns":"trigger","language":"plpgsql","parallel":"u","arguments":"","configSha":"8a99a028247dc2f9ba6a2dad007920a9e88dc640cab71800ebd92d401c25d7c9","volatility":"v","defaultsSha":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855","definitionSha":"ff29eadf0fc1af83851155f4f4b4232c10b595cdd0868796a7fd4717ee9de3c6","securityDefiner":false}]},{"name":"career_task_effect_status_v1","overloads":[{"acl":[{"grantee":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"service_role","grantable":false,"privilege":"EXECUTE"}],"owner":"postgres","strict":false,"bodySha":"f60e565cf6d7a2d126d29a29c89c0bd98cf5a71343823209fc8cde1095794526","returns":"jsonb","language":"sql","parallel":"u","arguments":"p_user uuid, p_token uuid","configSha":"8a99a028247dc2f9ba6a2dad007920a9e88dc640cab71800ebd92d401c25d7c9","volatility":"v","defaultsSha":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855","definitionSha":"4aebb633316ca5ecb248c7b0319dfd25ce8e0866a490450fb3666960da58b82b","securityDefiner":false}]},{"name":"career_task_finish_v1","overloads":[{"acl":[{"grantee":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"service_role","grantable":false,"privilege":"EXECUTE"}],"owner":"postgres","strict":false,"bodySha":"8807fadceb3d3ff295d4822f6362fc9f47145414a24350ee7026a1dfade1bfdb","returns":"jsonb","language":"plpgsql","parallel":"u","arguments":"p_user uuid, p_intent text, p_lease uuid, p_result jsonb","configSha":"8a99a028247dc2f9ba6a2dad007920a9e88dc640cab71800ebd92d401c25d7c9","volatility":"v","defaultsSha":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855","definitionSha":"eb3c7deaa3c1d7e6e965e0d6814e48c729c0ff4745a83eda9aba1be97b96ae21","securityDefiner":false}]},{"name":"career_task_owned_grant_v1","overloads":[]},{"name":"career_task_owned_lease_fence_v1","overloads":[]},{"name":"career_task_pending_owned_v1","overloads":[]},{"name":"career_task_pending_scoped_v1","overloads":[]},{"name":"career_task_pending_v1","overloads":[{"acl":[{"grantee":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"service_role","grantable":false,"privilege":"EXECUTE"}],"owner":"postgres","strict":false,"bodySha":"6b75513ddb4d1fe61e57e4c4d1b5e32e42b5a0aabceb54cb12b37c6b602e8795","returns":"jsonb","language":"sql","parallel":"u","arguments":"","configSha":"8a99a028247dc2f9ba6a2dad007920a9e88dc640cab71800ebd92d401c25d7c9","volatility":"v","defaultsSha":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855","definitionSha":"b655bfc816d14bedf8c65f159162b8875ea71986a1ba2b1433f483c04887f590","securityDefiner":false}]},{"name":"career_task_result_v1","overloads":[{"acl":[{"grantee":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"service_role","grantable":false,"privilege":"EXECUTE"}],"owner":"postgres","strict":false,"bodySha":"d3f750fb6fc3104b001d9da512af96aef18b20348ddc685f3040483566d88178","returns":"jsonb","language":"sql","parallel":"u","arguments":"p_user uuid, p_task text, p_intent text","configSha":"8a99a028247dc2f9ba6a2dad007920a9e88dc640cab71800ebd92d401c25d7c9","volatility":"v","defaultsSha":"bdd9c85e081b1df16cc6ed1e7bfc16685b2746fdae4bde054f57617ef8cb5c82","definitionSha":"d3c9fed192eea844a608dba191437ab07a890913080afefbde32d60e79085075","securityDefiner":false}]},{"name":"career_task_settle_effect_v1","overloads":[{"acl":[{"grantee":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"service_role","grantable":false,"privilege":"EXECUTE"}],"owner":"postgres","strict":false,"bodySha":"3ad5df48eb5a09291f8370b0693380ba6826325fca5693c2a48dfa770cf03bb5","returns":"jsonb","language":"plpgsql","parallel":"u","arguments":"p_user uuid, p_token uuid, p_outcome text, p_before text, p_after text","configSha":"8a99a028247dc2f9ba6a2dad007920a9e88dc640cab71800ebd92d401c25d7c9","volatility":"v","defaultsSha":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855","definitionSha":"e0d302987b3b354eca42196029a3dcb026f7cb39718e2fc910b6d2aa64f85ce8","securityDefiner":false}]},{"name":"career_task_turn_commit_v1","overloads":[{"acl":[{"grantee":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"service_role","grantable":false,"privilege":"EXECUTE"}],"owner":"postgres","strict":false,"bodySha":"9403340cb86e871fce167de9ac3c7c63aea1df3bc565167472dfd6f3af50c13d","returns":"jsonb","language":"plpgsql","parallel":"u","arguments":"p_base jsonb, p_intent jsonb","configSha":"8a99a028247dc2f9ba6a2dad007920a9e88dc640cab71800ebd92d401c25d7c9","volatility":"v","defaultsSha":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855","definitionSha":"f08a0cc02e15af1d9762950e1311b131bae774a8b3b403ea2079ac7702fa60c8","securityDefiner":false}]},{"name":"career_watch_cycle_commit","overloads":[{"acl":[{"grantee":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"service_role","grantable":false,"privilege":"EXECUTE"}],"owner":"postgres","strict":false,"bodySha":"0072b5e2a0058e4caa5813b15e94c87b4aa6ab82a659426590b0ea43b4fc64d9","returns":"jsonb","language":"plpgsql","parallel":"u","arguments":"p_user uuid, p_version bigint, p_epoch bigint, p_writes jsonb, p_reminders jsonb","configSha":"8a99a028247dc2f9ba6a2dad007920a9e88dc640cab71800ebd92d401c25d7c9","volatility":"v","defaultsSha":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855","definitionSha":"df2f2914052a8a63c1611a1f66e6f5fb4a1505504a77b5176aebdd3d4581e9b9","securityDefiner":false}]},{"name":"career_watch_read","overloads":[{"acl":[{"grantee":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"service_role","grantable":false,"privilege":"EXECUTE"}],"owner":"postgres","strict":false,"bodySha":"cc4ab7c13c75ddea42ddecd92319c2920936c99af37a14330dcd141a0b8cf20e","returns":"jsonb","language":"sql","parallel":"u","arguments":"p_user uuid, p_key text","configSha":"8a99a028247dc2f9ba6a2dad007920a9e88dc640cab71800ebd92d401c25d7c9","volatility":"v","defaultsSha":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855","definitionSha":"8adbd7b01a618847f70c2f52b4a1948e0afa52c970f925efc69eb82108d297cc","securityDefiner":false}]},{"name":"career_watch_write","overloads":[{"acl":[{"grantee":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"service_role","grantable":false,"privilege":"EXECUTE"}],"owner":"postgres","strict":false,"bodySha":"279593e2ce653a1c79d570e52697466e16a050c5277c0c13df97138ebd8611ca","returns":"jsonb","language":"plpgsql","parallel":"u","arguments":"p_user uuid, p_key text, p_value jsonb, p_version bigint, p_epoch bigint","configSha":"8a99a028247dc2f9ba6a2dad007920a9e88dc640cab71800ebd92d401c25d7c9","volatility":"v","defaultsSha":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855","definitionSha":"e0547099047b8970f7703c4d32a27ccc343bc3a099a6bc4b7a3ebf027c0d1eb2","securityDefiner":false}]}],"relations":[{"acl":[{"grantee":"authenticated","grantable":false,"privilege":"SELECT"},{"grantee":"postgres","grantable":false,"privilege":"DELETE"},{"grantee":"postgres","grantable":false,"privilege":"INSERT"},{"grantee":"postgres","grantable":false,"privilege":"REFERENCES"},{"grantee":"postgres","grantable":false,"privilege":"SELECT"},{"grantee":"postgres","grantable":false,"privilege":"TRIGGER"},{"grantee":"postgres","grantable":false,"privilege":"TRUNCATE"},{"grantee":"postgres","grantable":false,"privilege":"UPDATE"},{"grantee":"service_role","grantable":false,"privilege":"DELETE"},{"grantee":"service_role","grantable":false,"privilege":"INSERT"},{"grantee":"service_role","grantable":false,"privilege":"REFERENCES"},{"grantee":"service_role","grantable":false,"privilege":"SELECT"},{"grantee":"service_role","grantable":false,"privilege":"TRIGGER"},{"grantee":"service_role","grantable":false,"privilege":"TRUNCATE"},{"grantee":"service_role","grantable":false,"privilege":"UPDATE"}],"rls":true,"kind":"r","name":"agent_model_calls","owner":"postgres","exists":true,"columns":[{"name":"id","type":"uuid","notNull":true,"identity":"","columnAcl":[],"generated":"","defaultSha":"eea9a3e7c2abe43835e2a6fdf92a7d1e6f145ad6dfbfd243fc5d395e5b390a33"},{"name":"user_id","type":"uuid","notNull":true,"identity":"","columnAcl":[],"generated":"","defaultSha":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"},{"name":"thread_id","type":"uuid","notNull":true,"identity":"","columnAcl":[],"generated":"","defaultSha":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"},{"name":"request_id","type":"uuid","notNull":true,"identity":"","columnAcl":[],"generated":"","defaultSha":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"},{"name":"step","type":"integer","notNull":true,"identity":"","columnAcl":[],"generated":"","defaultSha":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"},{"name":"model","type":"text","notNull":true,"identity":"","columnAcl":[],"generated":"","defaultSha":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"},{"name":"state","type":"text","notNull":true,"identity":"","columnAcl":[],"generated":"","defaultSha":"1f0571c0a13f8ed9af629fc7ea6495efbb10d6df29d0dd62d3e8e840480a967f"},{"name":"usage","type":"jsonb","notNull":false,"identity":"","columnAcl":[],"generated":"","defaultSha":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"},{"name":"created_at","type":"timestamp with time zone","notNull":true,"identity":"","columnAcl":[],"generated":"","defaultSha":"28a4dae0461e17af56e979c2095abfbe0bfc45fe9ca8abf3144338a518a1bb8f"}],"indexes":[{"name":"agent_model_calls_pkey","ready":true,"valid":true,"unique":true,"definitionSha":"61bee78963bb99ddb54798ac561c5e900b0579f087220592df2ef969c21e1a15"},{"name":"agent_model_calls_user_id_request_id_step_key","ready":true,"valid":true,"unique":true,"definitionSha":"7fc0223764add63fd1f1f1861173b8742958f1146806c1022b65a5b00b427a0a"},{"name":"agent_model_calls_user_month","ready":true,"valid":true,"unique":false,"definitionSha":"813e4f8708b2e3283b5664132306c792e3e8e067d6a064431b276fe7969b531e"}],"forceRls":false,"policies":[{"name":"agent_model_call_owner","roles":["PUBLIC"],"command":"r","schemas":[{"name":"auth","owner":"postgres","aclSha":"6e9abca1fdd8564991b445e192fd00047f5bbb933e174906754717864cbde85c"},{"name":"public","owner":"pg_database_owner","aclSha":"c5a6966a33c1b16ee146719e45fc9bf9206f1ec04124d1ce24af1853a0557267"}],"checkSha":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855","usingSha":"aa06a7622e21fd0ea5f47a3ca5c3ecaa67b99d6b9a6b8bc049f59a9f12f957cb","permissive":true,"defaultPrivileges":[]}],"triggers":[],"constraints":[{"kind":"c","name":"agent_model_calls_check","validated":true,"definitionSha":"b204703f53d0f0a342d34b8692b8692a84a0a903ecd352a943f56df857411c2f"},{"kind":"c","name":"agent_model_calls_model_check","validated":true,"definitionSha":"3ce273d38df3b3ed0243ed0c9018a3803d9f9b5e86239ee0f98b3f8c9b5b6800"},{"kind":"p","name":"agent_model_calls_pkey","validated":true,"definitionSha":"8c8464f42472e42ee190fc91ca8db79b5351d3a4609040516578d229c56f6fa5"},{"kind":"c","name":"agent_model_calls_state_check","validated":true,"definitionSha":"0bfcd02fcfd03836f38b52e19efbcc5fa0e2f1f89091bf4c007dc5613d260fc2"},{"kind":"c","name":"agent_model_calls_step_check","validated":true,"definitionSha":"f55bdfa4b06d4e8432a4a44daa3ef96a613d4fd9713e46346a41f08053a11206"},{"kind":"f","name":"agent_model_calls_thread_id_fkey","validated":true,"definitionSha":"de11990e6b36d2e1e8cf55b42429dff6be10bcf33634c19c299ee2710d7d7550"},{"kind":"f","name":"agent_model_calls_user_id_fkey","validated":true,"definitionSha":"7dffc1fe5c72443147ef9227e966626cdc6e5997f36e90bcc553577512766d2a"},{"kind":"u","name":"agent_model_calls_user_id_request_id_step_key","validated":true,"definitionSha":"a306b5599143f72597483e1ad127970d29d8c21415b8856028ca324d060e0501"}],"persistence":"p"},{"acl":[],"rls":null,"kind":null,"name":"career_applicant_resumes_v1","owner":null,"exists":false,"columns":[],"indexes":[],"forceRls":null,"policies":[],"triggers":[],"constraints":[],"persistence":null},{"acl":[],"rls":null,"kind":null,"name":"career_applicant_uploads_v1","owner":null,"exists":false,"columns":[],"indexes":[],"forceRls":null,"policies":[],"triggers":[],"constraints":[],"persistence":null},{"acl":[],"rls":null,"kind":null,"name":"career_application_admissions_v1","owner":null,"exists":false,"columns":[],"indexes":[],"forceRls":null,"policies":[],"triggers":[],"constraints":[],"persistence":null},{"acl":[],"rls":null,"kind":null,"name":"career_application_batch_commands_v1","owner":null,"exists":false,"columns":[],"indexes":[],"forceRls":null,"policies":[],"triggers":[],"constraints":[],"persistence":null},{"acl":[],"rls":null,"kind":null,"name":"career_application_batches_v1","owner":null,"exists":false,"columns":[],"indexes":[],"forceRls":null,"policies":[],"triggers":[],"constraints":[],"persistence":null},{"acl":[],"rls":null,"kind":null,"name":"career_application_batch_reviews_v1","owner":null,"exists":false,"columns":[],"indexes":[],"forceRls":null,"policies":[],"triggers":[],"constraints":[],"persistence":null},{"acl":[],"rls":null,"kind":null,"name":"career_application_batch_roles_v1","owner":null,"exists":false,"columns":[],"indexes":[],"forceRls":null,"policies":[],"triggers":[],"constraints":[],"persistence":null},{"acl":[],"rls":null,"kind":null,"name":"career_application_profile_reviews_v1","owner":null,"exists":false,"columns":[],"indexes":[],"forceRls":null,"policies":[],"triggers":[],"constraints":[],"persistence":null},{"acl":[],"rls":null,"kind":null,"name":"career_application_scope_requests_v1","owner":null,"exists":false,"columns":[],"indexes":[],"forceRls":null,"policies":[],"triggers":[],"constraints":[],"persistence":null},{"acl":[],"rls":null,"kind":null,"name":"career_application_searches_v1","owner":null,"exists":false,"columns":[],"indexes":[],"forceRls":null,"policies":[],"triggers":[],"constraints":[],"persistence":null},{"acl":[],"rls":null,"kind":null,"name":"career_application_search_scopes_v1","owner":null,"exists":false,"columns":[],"indexes":[],"forceRls":null,"policies":[],"triggers":[],"constraints":[],"persistence":null},{"acl":[],"rls":null,"kind":null,"name":"career_model_campaign_v1","owner":null,"exists":false,"columns":[],"indexes":[],"forceRls":null,"policies":[],"triggers":[],"constraints":[],"persistence":null},{"acl":[],"rls":null,"kind":null,"name":"career_model_pair_legs_v2","owner":null,"exists":false,"columns":[],"indexes":[],"forceRls":null,"policies":[],"triggers":[],"constraints":[],"persistence":null},{"acl":[],"rls":null,"kind":null,"name":"career_model_pair_policy_v2","owner":null,"exists":false,"columns":[],"indexes":[],"forceRls":null,"policies":[],"triggers":[],"constraints":[],"persistence":null},{"acl":[],"rls":null,"kind":null,"name":"career_model_pairs_v2","owner":null,"exists":false,"columns":[],"indexes":[],"forceRls":null,"policies":[],"triggers":[],"constraints":[],"persistence":null},{"acl":[],"rls":null,"kind":null,"name":"career_model_reservations_v1","owner":null,"exists":false,"columns":[],"indexes":[],"forceRls":null,"policies":[],"triggers":[],"constraints":[],"persistence":null},{"acl":[{"grantee":"postgres","grantable":false,"privilege":"DELETE"},{"grantee":"postgres","grantable":false,"privilege":"INSERT"},{"grantee":"postgres","grantable":false,"privilege":"REFERENCES"},{"grantee":"postgres","grantable":false,"privilege":"SELECT"},{"grantee":"postgres","grantable":false,"privilege":"TRIGGER"},{"grantee":"postgres","grantable":false,"privilege":"TRUNCATE"},{"grantee":"postgres","grantable":false,"privilege":"UPDATE"},{"grantee":"service_role","grantable":false,"privilege":"DELETE"},{"grantee":"service_role","grantable":false,"privilege":"INSERT"},{"grantee":"service_role","grantable":false,"privilege":"SELECT"},{"grantee":"service_role","grantable":false,"privilege":"UPDATE"}],"rls":true,"kind":"r","name":"career_reminder_outbox","owner":"postgres","exists":true,"columns":[{"name":"user_id","type":"uuid","notNull":true,"identity":"","columnAcl":[],"generated":"","defaultSha":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"},{"name":"reminder_id","type":"text","notNull":true,"identity":"","columnAcl":[],"generated":"","defaultSha":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"},{"name":"payload","type":"jsonb","notNull":false,"identity":"","columnAcl":[],"generated":"","defaultSha":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"},{"name":"record","type":"jsonb","notNull":false,"identity":"","columnAcl":[],"generated":"","defaultSha":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"},{"name":"status","type":"text","notNull":true,"identity":"","columnAcl":[],"generated":"","defaultSha":"a89df8d14a00b7bd2ead7e86414dcd5232bff306786856171b38584e153bb73f"},{"name":"lease_token","type":"uuid","notNull":false,"identity":"","columnAcl":[],"generated":"","defaultSha":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"},{"name":"lease_until","type":"timestamp with time zone","notNull":false,"identity":"","columnAcl":[],"generated":"","defaultSha":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"},{"name":"attempts","type":"integer","notNull":true,"identity":"","columnAcl":[],"generated":"","defaultSha":"5feceb66ffc86f38d952786c6d696c79c2dbc239dd4e91b46729d73a27fb57e9"},{"name":"created_at","type":"timestamp with time zone","notNull":true,"identity":"","columnAcl":[],"generated":"","defaultSha":"28a4dae0461e17af56e979c2095abfbe0bfc45fe9ca8abf3144338a518a1bb8f"},{"name":"updated_at","type":"timestamp with time zone","notNull":true,"identity":"","columnAcl":[],"generated":"","defaultSha":"28a4dae0461e17af56e979c2095abfbe0bfc45fe9ca8abf3144338a518a1bb8f"},{"name":"delivered_at","type":"timestamp with time zone","notNull":false,"identity":"","columnAcl":[],"generated":"","defaultSha":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"},{"name":"seen_at","type":"timestamp with time zone","notNull":false,"identity":"","columnAcl":[],"generated":"","defaultSha":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"}],"indexes":[{"name":"career_reminder_outbox_pkey","ready":true,"valid":true,"unique":true,"definitionSha":"c7d6e326a840d458fd9f5012ed0c58bdd0cec98c8187c48a3e8c5c5d56c6bd16"},{"name":"career_reminder_unseen","ready":true,"valid":true,"unique":false,"definitionSha":"95bb345c7646cbab78f1b05b1cea3ee7af703fa99710ab2f5dea7488e69a5b38"}],"forceRls":false,"policies":[{"name":"career_reminder_backend","roles":["service_role"],"command":"*","schemas":[{"name":"auth","owner":"postgres","aclSha":"6e9abca1fdd8564991b445e192fd00047f5bbb933e174906754717864cbde85c"},{"name":"public","owner":"pg_database_owner","aclSha":"c5a6966a33c1b16ee146719e45fc9bf9206f1ec04124d1ce24af1853a0557267"}],"checkSha":"b5bea41b6c623f7c09f1bf24dcae58ebab3c0cdd90ad966bc43a45b44867e12b","usingSha":"b5bea41b6c623f7c09f1bf24dcae58ebab3c0cdd90ad966bc43a45b44867e12b","permissive":true,"defaultPrivileges":[]}],"triggers":[],"constraints":[{"kind":"p","name":"career_reminder_outbox_pkey","validated":true,"definitionSha":"feca27c0c593a5a4c486e6649b1bfefa98c489964e133fe452dcf38f41b0a5b6"},{"kind":"c","name":"career_reminder_outbox_reminder_id_check","validated":true,"definitionSha":"f05de21912a517d87944647d41a80826965635083001fa736f11f3ecffcb22ca"},{"kind":"c","name":"career_reminder_outbox_status_check","validated":true,"definitionSha":"5b786cf70ea6bfa05e9795191cb552ff7339a7c90532bd0ba5e956bf03520dd5"},{"kind":"f","name":"career_reminder_outbox_user_id_fkey","validated":true,"definitionSha":"7dffc1fe5c72443147ef9227e966626cdc6e5997f36e90bcc553577512766d2a"}],"persistence":"p"},{"acl":[{"grantee":"postgres","grantable":false,"privilege":"DELETE"},{"grantee":"postgres","grantable":false,"privilege":"INSERT"},{"grantee":"postgres","grantable":false,"privilege":"REFERENCES"},{"grantee":"postgres","grantable":false,"privilege":"SELECT"},{"grantee":"postgres","grantable":false,"privilege":"TRIGGER"},{"grantee":"postgres","grantable":false,"privilege":"TRUNCATE"},{"grantee":"postgres","grantable":false,"privilege":"UPDATE"},{"grantee":"service_role","grantable":false,"privilege":"DELETE"},{"grantee":"service_role","grantable":false,"privilege":"INSERT"},{"grantee":"service_role","grantable":false,"privilege":"SELECT"},{"grantee":"service_role","grantable":false,"privilege":"UPDATE"}],"rls":true,"kind":"r","name":"career_task_effects_v1","owner":"postgres","exists":true,"columns":[{"name":"user_id","type":"uuid","notNull":true,"identity":"","columnAcl":[],"generated":"","defaultSha":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"},{"name":"intent_id","type":"text","notNull":true,"identity":"","columnAcl":[],"generated":"","defaultSha":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"},{"name":"effect_key","type":"text","notNull":true,"identity":"","columnAcl":[],"generated":"","defaultSha":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"},{"name":"task_id","type":"text","notNull":true,"identity":"","columnAcl":[],"generated":"","defaultSha":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"},{"name":"operation","type":"text","notNull":true,"identity":"","columnAcl":[],"generated":"","defaultSha":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"},{"name":"token","type":"uuid","notNull":true,"identity":"","columnAcl":[],"generated":"","defaultSha":"eea9a3e7c2abe43835e2a6fdf92a7d1e6f145ad6dfbfd243fc5d395e5b390a33"},{"name":"state","type":"text","notNull":true,"identity":"","columnAcl":[],"generated":"","defaultSha":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"},{"name":"before_sha256","type":"text","notNull":false,"identity":"","columnAcl":[],"generated":"","defaultSha":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"},{"name":"after_sha256","type":"text","notNull":false,"identity":"","columnAcl":[],"generated":"","defaultSha":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"},{"name":"created_at","type":"timestamp with time zone","notNull":true,"identity":"","columnAcl":[],"generated":"","defaultSha":"28a4dae0461e17af56e979c2095abfbe0bfc45fe9ca8abf3144338a518a1bb8f"}],"indexes":[{"name":"career_task_effects_v1_pkey","ready":true,"valid":true,"unique":true,"definitionSha":"990320fead46b768d5167ff4364582d8aab4b06aa3dfbea4f31007ba642e6295"},{"name":"career_task_effects_v1_token_key","ready":true,"valid":true,"unique":true,"definitionSha":"0437d79243f7cc706fc29fb4465588be10c6e541b97c95ddab7f9d23f8077601"},{"name":"career_task_one_submit_v1","ready":true,"valid":true,"unique":true,"definitionSha":"52fdf53e8f143d196c064f06f3b048f91e1994b0aa8a96fb1eaac686c30de018"}],"forceRls":false,"policies":[{"name":"career_effect_backend_v1","roles":["service_role"],"command":"*","schemas":[{"name":"auth","owner":"postgres","aclSha":"6e9abca1fdd8564991b445e192fd00047f5bbb933e174906754717864cbde85c"},{"name":"public","owner":"pg_database_owner","aclSha":"c5a6966a33c1b16ee146719e45fc9bf9206f1ec04124d1ce24af1853a0557267"}],"checkSha":"b5bea41b6c623f7c09f1bf24dcae58ebab3c0cdd90ad966bc43a45b44867e12b","usingSha":"b5bea41b6c623f7c09f1bf24dcae58ebab3c0cdd90ad966bc43a45b44867e12b","permissive":true,"defaultPrivileges":[]}],"triggers":[],"constraints":[{"kind":"p","name":"career_task_effects_v1_pkey","validated":true,"definitionSha":"58113cf701d0d00e5992ade566dd36ae46db740aab34e2868961d0d53371c93e"},{"kind":"c","name":"career_task_effects_v1_state_check","validated":true,"definitionSha":"21fd5af3d578eff92a96e87cc8a536f429f45bfac978148477046c7339c4592a"},{"kind":"u","name":"career_task_effects_v1_token_key","validated":true,"definitionSha":"a8420b878df4ffc6be2b861b570edcec86d44e6f5123aabb66cc6c78d0a0fc03"},{"kind":"f","name":"career_task_effects_v1_user_id_intent_id_fkey","validated":true,"definitionSha":"e72fbce8551c4f9f7298060628b97f35bd64b22a1ed18df303a978bf984f20c1"}],"persistence":"p"},{"acl":[{"grantee":"postgres","grantable":false,"privilege":"DELETE"},{"grantee":"postgres","grantable":false,"privilege":"INSERT"},{"grantee":"postgres","grantable":false,"privilege":"REFERENCES"},{"grantee":"postgres","grantable":false,"privilege":"SELECT"},{"grantee":"postgres","grantable":false,"privilege":"TRIGGER"},{"grantee":"postgres","grantable":false,"privilege":"TRUNCATE"},{"grantee":"postgres","grantable":false,"privilege":"UPDATE"},{"grantee":"service_role","grantable":false,"privilege":"DELETE"},{"grantee":"service_role","grantable":false,"privilege":"INSERT"},{"grantee":"service_role","grantable":false,"privilege":"SELECT"},{"grantee":"service_role","grantable":false,"privilege":"UPDATE"}],"rls":true,"kind":"r","name":"career_task_intents_v1","owner":"postgres","exists":true,"columns":[{"name":"user_id","type":"uuid","notNull":true,"identity":"","columnAcl":[],"generated":"","defaultSha":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"},{"name":"intent_id","type":"text","notNull":true,"identity":"","columnAcl":[],"generated":"","defaultSha":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"},{"name":"thread_id","type":"uuid","notNull":true,"identity":"","columnAcl":[],"generated":"","defaultSha":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"},{"name":"turn_key","type":"text","notNull":true,"identity":"","columnAcl":[],"generated":"","defaultSha":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"},{"name":"request_hash","type":"text","notNull":true,"identity":"","columnAcl":[],"generated":"","defaultSha":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"},{"name":"event_hash","type":"text","notNull":true,"identity":"","columnAcl":[],"generated":"","defaultSha":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"},{"name":"binding","type":"jsonb","notNull":true,"identity":"","columnAcl":[],"generated":"","defaultSha":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"},{"name":"private_input","type":"jsonb","notNull":false,"identity":"","columnAcl":[],"generated":"","defaultSha":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"},{"name":"result","type":"jsonb","notNull":false,"identity":"","columnAcl":[],"generated":"","defaultSha":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"},{"name":"authority_account_version","type":"bigint","notNull":true,"identity":"","columnAcl":[],"generated":"","defaultSha":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"},{"name":"privacy_epoch","type":"bigint","notNull":true,"identity":"","columnAcl":[],"generated":"","defaultSha":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"},{"name":"state","type":"text","notNull":true,"identity":"","columnAcl":[],"generated":"","defaultSha":"920ca217af670763272ef2a643e7baedb0cb3d49984e3c8d1a1bd4c24732bfa0"},{"name":"task_id","type":"text","notNull":false,"identity":"","columnAcl":[],"generated":"","defaultSha":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"},{"name":"lease_token","type":"uuid","notNull":false,"identity":"","columnAcl":[],"generated":"","defaultSha":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"},{"name":"expires_at","type":"timestamp with time zone","notNull":true,"identity":"","columnAcl":[],"generated":"","defaultSha":"f99983d3cd4b47d5f4ef782c736425f5143ab18249812fe14bb6dafd7c3db244"},{"name":"spent","type":"integer","notNull":true,"identity":"","columnAcl":[],"generated":"","defaultSha":"5feceb66ffc86f38d952786c6d696c79c2dbc239dd4e91b46729d73a27fb57e9"},{"name":"reserved","type":"integer","notNull":true,"identity":"","columnAcl":[],"generated":"","defaultSha":"5feceb66ffc86f38d952786c6d696c79c2dbc239dd4e91b46729d73a27fb57e9"},{"name":"budget_limit","type":"integer","notNull":true,"identity":"","columnAcl":[],"generated":"","defaultSha":"2abaca4911e68fa9bfbf3482ee797fd5b9045b841fdff7253557c5fe15de6477"},{"name":"created_at","type":"timestamp with time zone","notNull":true,"identity":"","columnAcl":[],"generated":"","defaultSha":"28a4dae0461e17af56e979c2095abfbe0bfc45fe9ca8abf3144338a518a1bb8f"},{"name":"updated_at","type":"timestamp with time zone","notNull":true,"identity":"","columnAcl":[],"generated":"","defaultSha":"28a4dae0461e17af56e979c2095abfbe0bfc45fe9ca8abf3144338a518a1bb8f"}],"indexes":[{"name":"career_task_intents_v1_pkey","ready":true,"valid":true,"unique":true,"definitionSha":"2fbdeeb1f6fff6ee25dc99db2d49e64846d4e75b92ead7730d50e93359905819"},{"name":"career_task_intents_v1_user_id_event_hash_key","ready":true,"valid":true,"unique":true,"definitionSha":"5c9f4c8bf285e89371336ca8f2cb0d8794619b341caa0d14529fce803a31b759"},{"name":"career_task_intents_v1_user_id_thread_id_turn_key_key","ready":true,"valid":true,"unique":true,"definitionSha":"2d8961e1c8696ad266fe06acb549d77e08bf37f6f22a623b786157dddd493d56"}],"forceRls":false,"policies":[{"name":"career_task_backend_v1","roles":["service_role"],"command":"*","schemas":[{"name":"auth","owner":"postgres","aclSha":"6e9abca1fdd8564991b445e192fd00047f5bbb933e174906754717864cbde85c"},{"name":"public","owner":"pg_database_owner","aclSha":"c5a6966a33c1b16ee146719e45fc9bf9206f1ec04124d1ce24af1853a0557267"}],"checkSha":"b5bea41b6c623f7c09f1bf24dcae58ebab3c0cdd90ad966bc43a45b44867e12b","usingSha":"b5bea41b6c623f7c09f1bf24dcae58ebab3c0cdd90ad966bc43a45b44867e12b","permissive":true,"defaultPrivileges":[]}],"triggers":[],"constraints":[{"kind":"c","name":"career_task_intents_v1_intent_id_check","validated":true,"definitionSha":"ecdaeb8624d01a3c6eaf944559f51735cf6fa1c30fdfac078620908fbf70a30b"},{"kind":"p","name":"career_task_intents_v1_pkey","validated":true,"definitionSha":"1acca75b21c39d233fbbc46eb9c681197a9f7550e63cace75af5e8a728f1a44a"},{"kind":"c","name":"career_task_intents_v1_state_check","validated":true,"definitionSha":"4e0bb424ffec13b14e5d0cc37e0e2d111d6d5e203461a65182dfaea7ff594fb1"},{"kind":"f","name":"career_task_intents_v1_thread_id_fkey","validated":true,"definitionSha":"beeceecbb444bc4b46544c58e2d0dd5aaecac0e85b9d4ad34e57964b93ea02a1"},{"kind":"u","name":"career_task_intents_v1_user_id_event_hash_key","validated":true,"definitionSha":"db4c550c7ef2f701b87b983b2e35c64884b8cbcf0fb8fcebcce8cff98478d291"},{"kind":"f","name":"career_task_intents_v1_user_id_fkey","validated":true,"definitionSha":"7dffc1fe5c72443147ef9227e966626cdc6e5997f36e90bcc553577512766d2a"},{"kind":"u","name":"career_task_intents_v1_user_id_thread_id_turn_key_key","validated":true,"definitionSha":"088f61faa97940696743f32df0e6ba226a6d2fbf9b2ab6cff8f96ed2068bd1c4"}],"persistence":"p"},{"acl":[{"grantee":"postgres","grantable":false,"privilege":"DELETE"},{"grantee":"postgres","grantable":false,"privilege":"INSERT"},{"grantee":"postgres","grantable":false,"privilege":"REFERENCES"},{"grantee":"postgres","grantable":false,"privilege":"SELECT"},{"grantee":"postgres","grantable":false,"privilege":"TRIGGER"},{"grantee":"postgres","grantable":false,"privilege":"TRUNCATE"},{"grantee":"postgres","grantable":false,"privilege":"UPDATE"},{"grantee":"service_role","grantable":false,"privilege":"DELETE"},{"grantee":"service_role","grantable":false,"privilege":"INSERT"},{"grantee":"service_role","grantable":false,"privilege":"SELECT"},{"grantee":"service_role","grantable":false,"privilege":"UPDATE"}],"rls":true,"kind":"r","name":"career_watch_kv","owner":"postgres","exists":true,"columns":[{"name":"user_id","type":"uuid","notNull":true,"identity":"","columnAcl":[],"generated":"","defaultSha":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"},{"name":"key","type":"text","notNull":true,"identity":"","columnAcl":[],"generated":"","defaultSha":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"},{"name":"value","type":"jsonb","notNull":true,"identity":"","columnAcl":[],"generated":"","defaultSha":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"},{"name":"updated_at","type":"timestamp with time zone","notNull":true,"identity":"","columnAcl":[],"generated":"","defaultSha":"28a4dae0461e17af56e979c2095abfbe0bfc45fe9ca8abf3144338a518a1bb8f"}],"indexes":[{"name":"career_watch_kv_pkey","ready":true,"valid":true,"unique":true,"definitionSha":"6cd76c8150e0e795b19476db90e3fbae7035823b3586bc991abd481c276fbc37"}],"forceRls":false,"policies":[{"name":"career_watch_backend","roles":["service_role"],"command":"*","schemas":[{"name":"auth","owner":"postgres","aclSha":"6e9abca1fdd8564991b445e192fd00047f5bbb933e174906754717864cbde85c"},{"name":"public","owner":"pg_database_owner","aclSha":"c5a6966a33c1b16ee146719e45fc9bf9206f1ec04124d1ce24af1853a0557267"}],"checkSha":"b5bea41b6c623f7c09f1bf24dcae58ebab3c0cdd90ad966bc43a45b44867e12b","usingSha":"b5bea41b6c623f7c09f1bf24dcae58ebab3c0cdd90ad966bc43a45b44867e12b","permissive":true,"defaultPrivileges":[]}],"triggers":[{"name":"career_task_account_control_v1","enabled":"O","definitionSha":"843826accb7df868c5fe98a825d08c7b011a1c4289526ebf5df4e36f273aca77"}],"constraints":[{"kind":"p","name":"career_watch_kv_pkey","validated":true,"definitionSha":"5b8b02cfd419851920c6ddf8ed70d664b62b7b38eefb2ba940e32d7c720f2480"},{"kind":"f","name":"career_watch_kv_user_id_fkey","validated":true,"definitionSha":"7dffc1fe5c72443147ef9227e966626cdc6e5997f36e90bcc553577512766d2a"}],"persistence":"p"}],"serverMajor":16,"dependencies":[{"name":"auth.users","columns":[{"name":"id","type":"uuid","exists":true,"notNull":true}]},{"name":"public.agent_flow_state","columns":[{"name":"state","type":"jsonb","exists":true,"notNull":true},{"name":"thread_id","type":"uuid","exists":true,"notNull":true},{"name":"updated_at","type":"timestamp with time zone","exists":true,"notNull":true},{"name":"user_id","type":"uuid","exists":true,"notNull":true}]},{"name":"public.agent_messages","columns":[{"name":"content","type":"text","exists":true,"notNull":false},{"name":"created_at","type":"timestamp with time zone","exists":true,"notNull":false},{"name":"id","type":"uuid","exists":true,"notNull":true},{"name":"meta","type":"jsonb","exists":true,"notNull":false},{"name":"role","type":"text","exists":true,"notNull":false},{"name":"thread_id","type":"uuid","exists":true,"notNull":true}]},{"name":"public.agent_threads","columns":[{"name":"id","type":"uuid","exists":true,"notNull":true},{"name":"user_id","type":"uuid","exists":true,"notNull":true}]},{"name":"public.agent_usage","columns":[{"name":"cache_read_tokens","type":"integer","exists":true,"notNull":true},{"name":"cache_write_tokens","type":"integer","exists":true,"notNull":true},{"name":"call_id","type":"uuid","exists":true,"notNull":false},{"name":"created_at","type":"timestamp with time zone","exists":true,"notNull":true},{"name":"id","type":"uuid","exists":true,"notNull":true},{"name":"input_tokens","type":"integer","exists":true,"notNull":true},{"name":"model","type":"text","exists":true,"notNull":true},{"name":"output_tokens","type":"integer","exists":true,"notNull":true},{"name":"thread_id","type":"uuid","exists":true,"notNull":true},{"name":"user_id","type":"uuid","exists":true,"notNull":true}]},{"name":"public.profiles","columns":[{"name":"id","type":"uuid","exists":true,"notNull":true}]}],"defaultPrivileges":[]}'::jsonb; prior record; installed_sha text;
BEGIN
 select jsonb_build_object('version','career_forward_catalog/v1','serverMajor',current_setting('server_version_num')::integer/10000,
 'schemas',(select jsonb_agg(jsonb_build_object('name',n.nspname,'owner',pg_get_userbyid(n.nspowner),'aclSha',encode(sha256(convert_to(coalesce(n.nspacl::text,''),'UTF8')),'hex'))order by n.nspname)from pg_namespace n where n.nspname in('public','auth')),
 'defaultPrivileges',(select coalesce(jsonb_agg(jsonb_build_object('owner',pg_get_userbyid(d.defaclrole),'schema',coalesce(n.nspname,'GLOBAL'),'kind',d.defaclobjtype,'aclSha',encode(sha256(convert_to(d.defaclacl::text,'UTF8')),'hex'))order by pg_get_userbyid(d.defaclrole),coalesce(n.nspname,'GLOBAL'),d.defaclobjtype),'[]')from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace where d.defaclnamespace=0 or n.nspname in('public','auth')),
 'roles',(select jsonb_agg(jsonb_build_object('name',v.name,'exists',r.oid is not null,'bypassRLS',r.rolbypassrls)order by v.name)from(VALUES('service_role'),('anon'),('authenticated'))v(name)left join pg_roles r on r.rolname=v.name),
 'relations',(select jsonb_agg(jsonb_build_object('name',v.name,'exists',c.oid is not null,'kind',c.relkind,'persistence',c.relpersistence,'owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,
 'columns',(select coalesce(jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'notNull',a.attnotnull,'identity',a.attidentity,'generated',a.attgenerated,'columnAcl',(select coalesce(jsonb_agg(jsonb_build_object('grantee',case when ca.grantee=0 then 'PUBLIC'else pg_get_userbyid(ca.grantee)end,'privilege',ca.privilege_type,'grantable',ca.is_grantable)order by case when ca.grantee=0 then 'PUBLIC'else pg_get_userbyid(ca.grantee)end,ca.privilege_type),'[]')from aclexplode(a.attacl)ca),'defaultSha',encode(sha256(convert_to(coalesce(pg_get_expr(d.adbin,d.adrelid),''),'UTF8')),'hex'))order by a.attnum),'[]')from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),
 'constraints',(select coalesce(jsonb_agg(jsonb_build_object('name',k.conname,'kind',k.contype,'validated',k.convalidated,'definitionSha',encode(sha256(convert_to(pg_get_constraintdef(k.oid),'UTF8')),'hex'))order by k.conname),'[]')from pg_constraint k where k.conrelid=c.oid),
 'indexes',(select coalesce(jsonb_agg(jsonb_build_object('name',ic.relname,'valid',i.indisvalid,'ready',i.indisready,'unique',i.indisunique,'definitionSha',encode(sha256(convert_to(pg_get_indexdef(i.indexrelid),'UTF8')),'hex'))order by ic.relname),'[]')from pg_index i join pg_class ic on ic.oid=i.indexrelid where i.indrelid=c.oid),
 'policies',(select coalesce(jsonb_agg(jsonb_build_object('name',p.polname,'command',p.polcmd,'permissive',p.polpermissive,'schemas',(select jsonb_agg(jsonb_build_object('name',n.nspname,'owner',pg_get_userbyid(n.nspowner),'aclSha',encode(sha256(convert_to(coalesce(n.nspacl::text,''),'UTF8')),'hex'))order by n.nspname)from pg_namespace n where n.nspname in('public','auth')),
 'defaultPrivileges',(select coalesce(jsonb_agg(jsonb_build_object('owner',pg_get_userbyid(d.defaclrole),'schema',coalesce(n.nspname,'GLOBAL'),'kind',d.defaclobjtype,'aclSha',encode(sha256(convert_to(d.defaclacl::text,'UTF8')),'hex'))order by pg_get_userbyid(d.defaclrole),coalesce(n.nspname,'GLOBAL'),d.defaclobjtype),'[]')from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace where d.defaclnamespace=0 or n.nspname in('public','auth')),
 'roles',(select jsonb_agg(case when x=0 then 'PUBLIC' else pg_get_userbyid(x)end order by case when x=0 then 'PUBLIC'else pg_get_userbyid(x)end)from unnest(p.polroles)x),'usingSha',encode(sha256(convert_to(coalesce(pg_get_expr(p.polqual,p.polrelid),''),'UTF8')),'hex'),'checkSha',encode(sha256(convert_to(coalesce(pg_get_expr(p.polwithcheck,p.polrelid),''),'UTF8')),'hex'))order by p.polname),'[]')from pg_policy p where p.polrelid=c.oid),
 'triggers',(select coalesce(jsonb_agg(jsonb_build_object('name',t.tgname,'enabled',t.tgenabled,'definitionSha',encode(sha256(convert_to(pg_get_triggerdef(t.oid),'UTF8')),'hex'))order by t.tgname),'[]')from pg_trigger t where t.tgrelid=c.oid and not t.tgisinternal),'acl',(select coalesce(jsonb_agg(jsonb_build_object('grantee',case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,'privilege',a.privilege_type,'grantable',a.is_grantable)order by case when a.grantee=0 then 'PUBLIC'else pg_get_userbyid(a.grantee)end,a.privilege_type),'[]')from aclexplode(coalesce(c.relacl,acldefault('r',c.relowner)))a))order by v.name)from unnest(ARRAY['agent_model_calls','career_applicant_resumes_v1','career_applicant_uploads_v1','career_application_admissions_v1','career_application_batch_commands_v1','career_application_batch_reviews_v1','career_application_batch_roles_v1','career_application_batches_v1','career_application_profile_reviews_v1','career_application_scope_requests_v1','career_application_search_scopes_v1','career_application_searches_v1','career_model_campaign_v1','career_model_pair_legs_v2','career_model_pair_policy_v2','career_model_pairs_v2','career_model_reservations_v1','career_reminder_outbox','career_task_effects_v1','career_task_intents_v1','career_watch_kv']::text[])v(name)left join pg_class c on c.oid=to_regclass('public.'||v.name)),
 'functions',(select jsonb_agg(jsonb_build_object('name',v.name,'overloads',(select coalesce(jsonb_agg(jsonb_build_object('arguments',pg_get_function_identity_arguments(p.oid),'returns',pg_get_function_result(p.oid),'owner',pg_get_userbyid(p.proowner),'language',(select lanname from pg_language where oid=p.prolang),'securityDefiner',p.prosecdef,'volatility',p.provolatile,'parallel',p.proparallel,'strict',p.proisstrict,'definitionSha',encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'),'bodySha',encode(sha256(convert_to(p.prosrc,'UTF8')),'hex'),'configSha',encode(sha256(convert_to(coalesce(p.proconfig::text,''),'UTF8')),'hex'),'defaultsSha',encode(sha256(convert_to(coalesce(pg_get_expr(p.proargdefaults,0),''),'UTF8')),'hex'),'acl',(select coalesce(jsonb_agg(jsonb_build_object('grantee',case when a.grantee=0 then 'PUBLIC'else pg_get_userbyid(a.grantee)end,'privilege',a.privilege_type,'grantable',a.is_grantable)order by case when a.grantee=0 then 'PUBLIC'else pg_get_userbyid(a.grantee)end,a.privilege_type),'[]')from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))a))order by pg_get_function_identity_arguments(p.oid)),'[]')from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'and p.proname=v.name and p.prokind='f'))order by v.name)from unnest(ARRAY['agent_model_call_record','agent_model_call_reserve','career_applicant_canonical_v1','career_applicant_confirm_turn_v1','career_applicant_equipment_resolve_base_v1','career_applicant_equipment_resolve_v1','career_applicant_resume_confirm_v1','career_applicant_resume_erase_v1','career_applicant_review_v1','career_applicant_status_v1','career_applicant_turn_version_v1','career_applicant_upload_erase_v1','career_applicant_upload_sweep_v1','career_applicant_upload_turn_v1','career_application_admission_history_v1','career_application_admit_v1','career_application_approval_source_guard_v1','career_application_batch_answers_v1','career_application_batch_context_v1','career_application_batch_control_v1','career_application_batch_erase_v1','career_application_batch_lookup_v1','career_application_batch_progress_v1','career_application_batch_queue_v1','career_application_chat_context_v1','career_application_conversation_erase_v1','career_application_profile_confirm_v1','career_application_profile_review_v1','career_application_search_prepare_v1','career_application_search_scope_v1','career_application_search_store_v1','career_application_source_refresh_context_v1','career_application_source_refresh_v1','career_application_task_context_v1','career_host_commit','career_host_load','career_journey_action_claim_v1','career_journey_action_read_v1','career_journey_artifact_open_v1','career_journey_artifact_scope_v1','career_journey_checker_prepare_v1','career_journey_context_basis_v1','career_journey_context_commit_v1','career_journey_context_content_v1','career_journey_context_cursor_v1','career_journey_context_load_v2','career_journey_context_read_v1','career_journey_context_refresh_commit_v1','career_journey_context_refresh_load_v1','career_journey_execution_fence_v1','career_journey_leg_consume_v1','career_journey_observe_v1','career_journey_outcome_record_v1','career_journey_readback_v1','career_journey_turn_commit_v1','career_model_budget_consume_v1','career_model_budget_reserve_v1','career_model_budget_settle_v1','career_model_context_barrier_v2','career_model_context_current_v1','career_model_context_read_v2','career_model_leg_consume_v2','career_model_leg_settle_v2','career_model_pair_read_v2','career_model_pair_reserve_v2','career_model_replay_check_v2','career_native_checker_prepare_v1','career_native_claim_v1','career_native_fence_v1','career_native_leg_consume_v1','career_native_observe_v1','career_native_outcome_v1','career_native_read_v1','career_native_replay_v1','career_native_turn_commit_v1','career_reminder_ack','career_reminder_allowed','career_reminder_claim','career_reminder_enqueue','career_reminder_list','career_reminder_status','career_task_account_v1','career_task_begin_effect_v1','career_task_claim_owned_v1','career_task_claim_readback_v1','career_task_claim_v1','career_task_consume_effect_v1','career_task_control_hook_v1','career_task_effect_status_v1','career_task_finish_v1','career_task_owned_grant_v1','career_task_owned_lease_fence_v1','career_task_pending_owned_v1','career_task_pending_scoped_v1','career_task_pending_v1','career_task_result_v1','career_task_settle_effect_v1','career_task_turn_commit_v1','career_watch_cycle_commit','career_watch_read','career_watch_write']::text[])v(name)),
 'dependencies',(select jsonb_agg(jsonb_build_object('name',e.key,'columns',(select coalesce(jsonb_agg(jsonb_build_object('name',v.name,'exists',a.attnum is not null,'type',format_type(a.atttypid,a.atttypmod),'notNull',a.attnotnull)order by v.name),'[]')from jsonb_array_elements_text(e.value)v(name)left join pg_attribute a on a.attrelid=to_regclass(e.key)and a.attname=v.name and a.attnum>0 and not a.attisdropped))order by e.key)from jsonb_each('{"auth.users":["id"],"public.profiles":["id"],"public.agent_threads":["id","user_id"],"public.agent_flow_state":["thread_id","user_id","state","updated_at"],"public.agent_messages":["id","thread_id","role","content","meta","created_at"],"public.agent_usage":["id","user_id","thread_id","model","call_id","input_tokens","output_tokens","cache_read_tokens","cache_write_tokens","created_at"]}'::jsonb)e)) INTO observed;
 IF to_regclass('public.career_forward_upgrade_v1') IS NOT NULL THEN
  IF NOT (select relrowsecurity from pg_class where oid='public.career_forward_upgrade_v1'::regclass) OR has_table_privilege('anon','public.career_forward_upgrade_v1','SELECT,INSERT,UPDATE,DELETE') OR has_table_privilege('authenticated','public.career_forward_upgrade_v1','SELECT,INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'UPGRADE_JOURNAL_PRIVILEGE_DRIFT';END IF;
  EXECUTE 'select *from public.career_forward_upgrade_v1 where migration_id=$1' INTO prior USING 'career-forward-upgrade/v1';
  IF prior.migration_id IS NULL OR prior.plan_sha256 IS DISTINCT FROM '065cc33333d3f1369a562d28fe61c769d0d75636b00b6851a22d3400d09cb6d3' THEN RAISE EXCEPTION 'UPGRADE_UNTRACKED_OR_CHANGED_PACKAGE';END IF;
  installed_sha:=encode(sha256(convert_to(observed::text,'UTF8')),'hex');
  IF installed_sha IS DISTINCT FROM prior.installed_catalog_sha256 THEN RAISE EXCEPTION 'UPGRADE_INSTALLED_CATALOG_DRIFT';END IF;
  RAISE NOTICE 'UPGRADE_ALREADY_APPLIED_NO_PERMANENT_WRITES';RETURN;
 END IF;
 IF expected IS NULL THEN RAISE EXCEPTION 'UPGRADE_REVIEWED_CATALOG_REQUIRED' USING HINT='Run the read-only collect-catalog.sql; supply signatures, body/config/default hashes, RLS/policy/grant/column/index/trigger metadata and dependency types. Unknown live definitions require source review, never overwrite.';END IF;
 IF observed IS DISTINCT FROM expected THEN RAISE EXCEPTION 'UPGRADE_BASELINE_CATALOG_MISMATCH' USING HINT='No permanent changes made. Inspect metadata-only catalog diff; newer live host/task definitions must not be replaced by assumption.';END IF;
 LOCK TABLE public.career_watch_kv,public.career_reminder_outbox,public.career_task_intents_v1,public.career_task_effects_v1,public.agent_model_calls IN ACCESS EXCLUSIVE MODE;
 select jsonb_build_object('version','career_forward_catalog/v1','serverMajor',current_setting('server_version_num')::integer/10000,
 'schemas',(select jsonb_agg(jsonb_build_object('name',n.nspname,'owner',pg_get_userbyid(n.nspowner),'aclSha',encode(sha256(convert_to(coalesce(n.nspacl::text,''),'UTF8')),'hex'))order by n.nspname)from pg_namespace n where n.nspname in('public','auth')),
 'defaultPrivileges',(select coalesce(jsonb_agg(jsonb_build_object('owner',pg_get_userbyid(d.defaclrole),'schema',coalesce(n.nspname,'GLOBAL'),'kind',d.defaclobjtype,'aclSha',encode(sha256(convert_to(d.defaclacl::text,'UTF8')),'hex'))order by pg_get_userbyid(d.defaclrole),coalesce(n.nspname,'GLOBAL'),d.defaclobjtype),'[]')from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace where d.defaclnamespace=0 or n.nspname in('public','auth')),
 'roles',(select jsonb_agg(jsonb_build_object('name',v.name,'exists',r.oid is not null,'bypassRLS',r.rolbypassrls)order by v.name)from(VALUES('service_role'),('anon'),('authenticated'))v(name)left join pg_roles r on r.rolname=v.name),
 'relations',(select jsonb_agg(jsonb_build_object('name',v.name,'exists',c.oid is not null,'kind',c.relkind,'persistence',c.relpersistence,'owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,
 'columns',(select coalesce(jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'notNull',a.attnotnull,'identity',a.attidentity,'generated',a.attgenerated,'columnAcl',(select coalesce(jsonb_agg(jsonb_build_object('grantee',case when ca.grantee=0 then 'PUBLIC'else pg_get_userbyid(ca.grantee)end,'privilege',ca.privilege_type,'grantable',ca.is_grantable)order by case when ca.grantee=0 then 'PUBLIC'else pg_get_userbyid(ca.grantee)end,ca.privilege_type),'[]')from aclexplode(a.attacl)ca),'defaultSha',encode(sha256(convert_to(coalesce(pg_get_expr(d.adbin,d.adrelid),''),'UTF8')),'hex'))order by a.attnum),'[]')from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),
 'constraints',(select coalesce(jsonb_agg(jsonb_build_object('name',k.conname,'kind',k.contype,'validated',k.convalidated,'definitionSha',encode(sha256(convert_to(pg_get_constraintdef(k.oid),'UTF8')),'hex'))order by k.conname),'[]')from pg_constraint k where k.conrelid=c.oid),
 'indexes',(select coalesce(jsonb_agg(jsonb_build_object('name',ic.relname,'valid',i.indisvalid,'ready',i.indisready,'unique',i.indisunique,'definitionSha',encode(sha256(convert_to(pg_get_indexdef(i.indexrelid),'UTF8')),'hex'))order by ic.relname),'[]')from pg_index i join pg_class ic on ic.oid=i.indexrelid where i.indrelid=c.oid),
 'policies',(select coalesce(jsonb_agg(jsonb_build_object('name',p.polname,'command',p.polcmd,'permissive',p.polpermissive,'schemas',(select jsonb_agg(jsonb_build_object('name',n.nspname,'owner',pg_get_userbyid(n.nspowner),'aclSha',encode(sha256(convert_to(coalesce(n.nspacl::text,''),'UTF8')),'hex'))order by n.nspname)from pg_namespace n where n.nspname in('public','auth')),
 'defaultPrivileges',(select coalesce(jsonb_agg(jsonb_build_object('owner',pg_get_userbyid(d.defaclrole),'schema',coalesce(n.nspname,'GLOBAL'),'kind',d.defaclobjtype,'aclSha',encode(sha256(convert_to(d.defaclacl::text,'UTF8')),'hex'))order by pg_get_userbyid(d.defaclrole),coalesce(n.nspname,'GLOBAL'),d.defaclobjtype),'[]')from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace where d.defaclnamespace=0 or n.nspname in('public','auth')),
 'roles',(select jsonb_agg(case when x=0 then 'PUBLIC' else pg_get_userbyid(x)end order by case when x=0 then 'PUBLIC'else pg_get_userbyid(x)end)from unnest(p.polroles)x),'usingSha',encode(sha256(convert_to(coalesce(pg_get_expr(p.polqual,p.polrelid),''),'UTF8')),'hex'),'checkSha',encode(sha256(convert_to(coalesce(pg_get_expr(p.polwithcheck,p.polrelid),''),'UTF8')),'hex'))order by p.polname),'[]')from pg_policy p where p.polrelid=c.oid),
 'triggers',(select coalesce(jsonb_agg(jsonb_build_object('name',t.tgname,'enabled',t.tgenabled,'definitionSha',encode(sha256(convert_to(pg_get_triggerdef(t.oid),'UTF8')),'hex'))order by t.tgname),'[]')from pg_trigger t where t.tgrelid=c.oid and not t.tgisinternal),'acl',(select coalesce(jsonb_agg(jsonb_build_object('grantee',case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,'privilege',a.privilege_type,'grantable',a.is_grantable)order by case when a.grantee=0 then 'PUBLIC'else pg_get_userbyid(a.grantee)end,a.privilege_type),'[]')from aclexplode(coalesce(c.relacl,acldefault('r',c.relowner)))a))order by v.name)from unnest(ARRAY['agent_model_calls','career_applicant_resumes_v1','career_applicant_uploads_v1','career_application_admissions_v1','career_application_batch_commands_v1','career_application_batch_reviews_v1','career_application_batch_roles_v1','career_application_batches_v1','career_application_profile_reviews_v1','career_application_scope_requests_v1','career_application_search_scopes_v1','career_application_searches_v1','career_model_campaign_v1','career_model_pair_legs_v2','career_model_pair_policy_v2','career_model_pairs_v2','career_model_reservations_v1','career_reminder_outbox','career_task_effects_v1','career_task_intents_v1','career_watch_kv']::text[])v(name)left join pg_class c on c.oid=to_regclass('public.'||v.name)),
 'functions',(select jsonb_agg(jsonb_build_object('name',v.name,'overloads',(select coalesce(jsonb_agg(jsonb_build_object('arguments',pg_get_function_identity_arguments(p.oid),'returns',pg_get_function_result(p.oid),'owner',pg_get_userbyid(p.proowner),'language',(select lanname from pg_language where oid=p.prolang),'securityDefiner',p.prosecdef,'volatility',p.provolatile,'parallel',p.proparallel,'strict',p.proisstrict,'definitionSha',encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'),'bodySha',encode(sha256(convert_to(p.prosrc,'UTF8')),'hex'),'configSha',encode(sha256(convert_to(coalesce(p.proconfig::text,''),'UTF8')),'hex'),'defaultsSha',encode(sha256(convert_to(coalesce(pg_get_expr(p.proargdefaults,0),''),'UTF8')),'hex'),'acl',(select coalesce(jsonb_agg(jsonb_build_object('grantee',case when a.grantee=0 then 'PUBLIC'else pg_get_userbyid(a.grantee)end,'privilege',a.privilege_type,'grantable',a.is_grantable)order by case when a.grantee=0 then 'PUBLIC'else pg_get_userbyid(a.grantee)end,a.privilege_type),'[]')from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))a))order by pg_get_function_identity_arguments(p.oid)),'[]')from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'and p.proname=v.name and p.prokind='f'))order by v.name)from unnest(ARRAY['agent_model_call_record','agent_model_call_reserve','career_applicant_canonical_v1','career_applicant_confirm_turn_v1','career_applicant_equipment_resolve_base_v1','career_applicant_equipment_resolve_v1','career_applicant_resume_confirm_v1','career_applicant_resume_erase_v1','career_applicant_review_v1','career_applicant_status_v1','career_applicant_turn_version_v1','career_applicant_upload_erase_v1','career_applicant_upload_sweep_v1','career_applicant_upload_turn_v1','career_application_admission_history_v1','career_application_admit_v1','career_application_approval_source_guard_v1','career_application_batch_answers_v1','career_application_batch_context_v1','career_application_batch_control_v1','career_application_batch_erase_v1','career_application_batch_lookup_v1','career_application_batch_progress_v1','career_application_batch_queue_v1','career_application_chat_context_v1','career_application_conversation_erase_v1','career_application_profile_confirm_v1','career_application_profile_review_v1','career_application_search_prepare_v1','career_application_search_scope_v1','career_application_search_store_v1','career_application_source_refresh_context_v1','career_application_source_refresh_v1','career_application_task_context_v1','career_host_commit','career_host_load','career_journey_action_claim_v1','career_journey_action_read_v1','career_journey_artifact_open_v1','career_journey_artifact_scope_v1','career_journey_checker_prepare_v1','career_journey_context_basis_v1','career_journey_context_commit_v1','career_journey_context_content_v1','career_journey_context_cursor_v1','career_journey_context_load_v2','career_journey_context_read_v1','career_journey_context_refresh_commit_v1','career_journey_context_refresh_load_v1','career_journey_execution_fence_v1','career_journey_leg_consume_v1','career_journey_observe_v1','career_journey_outcome_record_v1','career_journey_readback_v1','career_journey_turn_commit_v1','career_model_budget_consume_v1','career_model_budget_reserve_v1','career_model_budget_settle_v1','career_model_context_barrier_v2','career_model_context_current_v1','career_model_context_read_v2','career_model_leg_consume_v2','career_model_leg_settle_v2','career_model_pair_read_v2','career_model_pair_reserve_v2','career_model_replay_check_v2','career_native_checker_prepare_v1','career_native_claim_v1','career_native_fence_v1','career_native_leg_consume_v1','career_native_observe_v1','career_native_outcome_v1','career_native_read_v1','career_native_replay_v1','career_native_turn_commit_v1','career_reminder_ack','career_reminder_allowed','career_reminder_claim','career_reminder_enqueue','career_reminder_list','career_reminder_status','career_task_account_v1','career_task_begin_effect_v1','career_task_claim_owned_v1','career_task_claim_readback_v1','career_task_claim_v1','career_task_consume_effect_v1','career_task_control_hook_v1','career_task_effect_status_v1','career_task_finish_v1','career_task_owned_grant_v1','career_task_owned_lease_fence_v1','career_task_pending_owned_v1','career_task_pending_scoped_v1','career_task_pending_v1','career_task_result_v1','career_task_settle_effect_v1','career_task_turn_commit_v1','career_watch_cycle_commit','career_watch_read','career_watch_write']::text[])v(name)),
 'dependencies',(select jsonb_agg(jsonb_build_object('name',e.key,'columns',(select coalesce(jsonb_agg(jsonb_build_object('name',v.name,'exists',a.attnum is not null,'type',format_type(a.atttypid,a.atttypmod),'notNull',a.attnotnull)order by v.name),'[]')from jsonb_array_elements_text(e.value)v(name)left join pg_attribute a on a.attrelid=to_regclass(e.key)and a.attname=v.name and a.attnum>0 and not a.attisdropped))order by e.key)from jsonb_each('{"auth.users":["id"],"public.profiles":["id"],"public.agent_threads":["id","user_id"],"public.agent_flow_state":["thread_id","user_id","state","updated_at"],"public.agent_messages":["id","thread_id","role","content","meta","created_at"],"public.agent_usage":["id","user_id","thread_id","model","call_id","input_tokens","output_tokens","cache_read_tokens","cache_write_tokens","created_at"]}'::jsonb)e)) INTO observed;
 IF observed IS DISTINCT FROM expected THEN RAISE EXCEPTION 'UPGRADE_BASELINE_CHANGED_DURING_PREFLIGHT';END IF;
 IF EXISTS(select 1 from public.career_task_effects_v1 where state in('reserved','started')) OR EXISTS(select 1 from public.career_task_intents_v1 where state='claimed'and expires_at>clock_timestamp()) THEN RAISE EXCEPTION 'UPGRADE_WORKER_QUIESCENCE_REQUIRED' USING HINT='Fence existing workers and truthfully reconcile active effects; never reset/delete effects or unknown liabilities.';END IF;
 -- Original proposals contain unqualified CREATE TABLE; target public explicitly.
 PERFORM set_config('search_path','public,pg_catalog',true);
 -- supabase/sql/proposals/career_public_research_v1.sql statement 1
EXECUTE $up_7a5bb41eb49d1a4362c169d0$-- SOURCE-ONLY forward schema proposal; apply after 20261015234000.
-- CLI migration scaffolding is blocked in this executor; Muse must generate
-- its migration filename through a working Supabase CLI before integration.
-- Existing account authority, grants, RLS, memory functions and locks unchanged.
create or replace function public.career_task_turn_commit_v1(p_base jsonb,p_intent jsonb) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare u uuid; a jsonb; saved jsonb; row_intent career_task_intents_v1; k text; action text; payload jsonb;
begin
 u:=(p_base->>'p_user')::uuid;action:=p_intent->>'action';
 if p_intent is null or jsonb_typeof(p_intent)<>'object' or p_intent->>'version' is distinct from 'career_task_intent/v1' then raise exception 'invalid task intent version';end if;
 for k in select jsonb_object_keys(p_intent) loop
  if k not in ('version','intent_id','user_id','thread_id','turn_key','request_hash','action','task_id','event_id','artifact_id','resume_sha256','payload_sha256','profile_sha256','destination','authority_account_version','privacy_epoch','research') then raise exception 'unknown task intent field';end if;
 end loop;
 if coalesce(p_intent->>'intent_id','') !~ '^[a-f0-9]{64}$' or p_intent->>'user_id' is distinct from u::text or p_intent->>'thread_id' is distinct from p_base->>'p_thread' or p_intent->>'turn_key' is distinct from p_base->>'p_key' or p_intent->>'request_hash' is distinct from p_base->>'p_hash' or coalesce(action,'') not in ('prepare','approve','reconcile','research') or coalesce(p_intent->>'event_id','') !~ '^[A-Za-z0-9_-]{1,128}$' then raise exception 'invalid task intent binding';end if;
 if action<>'research' and p_intent ? 'research' then raise exception 'research binding on another task kind';end if;
 if action='research' and (jsonb_typeof(p_intent->'research') is distinct from 'object' or (select count(*) from jsonb_object_keys(p_intent->'research'))<>2 or p_intent#>>'{research,url}' is distinct from p_intent->>'destination' or coalesce(p_intent->>'destination','') !~ '^https://[a-z0-9.-]+/' or coalesce(length(p_intent#>>'{research,question}'),0) not between 1 and 500 or p_intent->>'task_id' is not null or p_intent->>'artifact_id' is not null or p_intent->>'resume_sha256' is not null or p_intent->>'payload_sha256' is not null or p_intent->>'profile_sha256' is not null) then raise exception 'invalid research intent';end if;
 if action='prepare' and (coalesce(p_intent->>'artifact_id','') !~ '^[A-Za-z0-9_-]{1,160}$' or coalesce(p_intent->>'resume_sha256','') !~ '^[a-f0-9]{64}$' or p_intent->>'destination' is distinct from p_base#>>'{p_snapshot,stores,posting,url}' or p_base#>>'{p_snapshot,stores,posting,canonicalKey}' is null) then raise exception 'invalid preparation intent';end if;
 if action in ('approve','reconcile') and coalesce(p_intent->>'task_id','') !~ '^[a-f0-9]{32}$' then raise exception 'invalid task identity';end if;
 if action='approve' and (coalesce(p_intent->>'resume_sha256','') !~ '^[a-f0-9]{64}$' or coalesce(p_intent->>'payload_sha256','') !~ '^[a-f0-9]{64}$' or coalesce(p_intent->>'destination','') !~ '^https?://' or p_base->>'p_input' is distinct from 'Approve browser task '||(p_intent->>'task_id')) then raise exception 'invalid task approval';end if;
 if p_intent ? 'profile_sha256' and p_intent->>'profile_sha256' is not null and p_intent->>'profile_sha256' !~ '^[a-f0-9]{64}$' then raise exception 'invalid profile binding';end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 if exists(select 1 from career_task_intents_v1 where user_id=u and event_hash=encode(sha256(convert_to(u::text||':'||(p_intent->>'event_id'),'UTF8')),'hex') and intent_id<>p_intent->>'intent_id') then return jsonb_build_object('error','task_event_conflict');end if;
 select value into a from career_watch_kv where user_id=u and key='career:account';
 select * into row_intent from career_task_intents_v1 where user_id=u and intent_id=p_intent->>'intent_id';
 if row_intent.intent_id is not null then
  if row_intent.binding is distinct from p_intent then raise exception 'immutable task intent conflict';end if;
 end if;
 -- Call the existing commit, never a fork of its transaction/control logic.
 saved:=career_host_commit(u,(p_base->>'p_thread')::uuid,p_base->>'p_key',p_base->>'p_hash',(p_base->>'p_revision')::bigint,(p_base->>'p_account_version')::bigint,p_base->'p_snapshot',p_base->'p_patch',p_base->>'p_input',p_base->'p_response');
 if saved ? 'error' then return saved;end if;
 if saved->'replay'='true'::jsonb then
  if row_intent.intent_id is null then raise exception 'replayed task receipt missing intent';end if;
  return saved;
 end if;
 select value into a from career_watch_kv where user_id=u and key='career:account';
 if a is null or (a->>'version')::bigint is distinct from (p_intent->>'authority_account_version')::bigint or coalesce((a->>'epoch')::bigint,0) is distinct from (p_intent->>'privacy_epoch')::bigint or (action<>'reconcile' and a->'paused'='true'::jsonb) then raise exception 'task authority changed';end if;
 if p_base#>>'{p_response,task,intent_id}' is distinct from p_intent->>'intent_id' or p_base#>>'{p_response,task,userId}' is distinct from u::text or p_base#>'{p_response,task,bindings}' is distinct from p_intent then raise exception 'task response binding mismatch';end if;
 payload:=case when action='research' then jsonb_build_object('eventId',p_intent->>'event_id','research',p_intent->'research') when action='prepare' then jsonb_build_object('eventId',p_intent->>'event_id','posting',p_base#>'{p_snapshot,stores,posting}','artifactId',p_intent->>'artifact_id','resumeSha256',p_intent->>'resume_sha256') else null end;
 insert into career_task_intents_v1(user_id,intent_id,thread_id,turn_key,request_hash,event_hash,binding,private_input,authority_account_version,privacy_epoch,task_id)
 values(u,p_intent->>'intent_id',(p_base->>'p_thread')::uuid,p_base->>'p_key',p_base->>'p_hash',encode(sha256(convert_to(u::text||':'||(p_intent->>'event_id'),'UTF8')),'hex'),p_intent,payload,(p_intent->>'authority_account_version')::bigint,(p_intent->>'privacy_epoch')::bigint,p_intent->>'task_id');
 return saved;
end $$;$up_7a5bb41eb49d1a4362c169d0$;
-- supabase/sql/proposals/career_public_research_v1.sql statement 2
EXECUTE $up_26ba4a6e34000b7a4fb222fc$

-- Readback includes immutable intent/effect bindings outside the mutable task
-- artifact. Edge validates these before quoting any captured source. Existing
-- application callers still receive their identical task field.
create or replace function public.career_task_result_v1(p_user uuid,p_task text default null,p_intent text default null) returns jsonb language sql security invoker set search_path=public,pg_temp as $$
 select coalesce((select jsonb_build_object('task',i.result,'researchProof',case when i.binding->>'action'='research' and i.result is not null then jsonb_build_object(
  'userId',i.user_id,'taskId',i.task_id,'intentId',i.intent_id,'binding',i.binding,
  'read',(select jsonb_build_object('state',e.state,'afterSha256',e.after_sha256,'admittedAt',e.created_at) from career_task_effects_v1 e where e.user_id=i.user_id and e.intent_id=i.intent_id and e.task_id=i.task_id and e.operation='read_public_page' order by e.created_at desc limit 1)) else null end)
  from career_task_intents_v1 i join career_watch_kv a on a.user_id=i.user_id and a.key='career:account' where i.user_id=p_user and (i.task_id=p_task or i.intent_id=p_intent) and i.privacy_epoch=coalesce((a.value->>'epoch')::bigint,0) order by i.updated_at desc limit 1),' {"task":null}'::jsonb);
$$;$up_26ba4a6e34000b7a4fb222fc$;
-- supabase/sql/proposals/career_public_research_v1.sql statement 3
EXECUTE $up_99d1aa83f7002151e8745fb7$

create or replace function public.career_task_begin_effect_v1(p_user uuid,p_intent text,p_lease uuid,p_task text,p_operation text,p_effect_key text,p_bindings jsonb) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare i career_task_intents_v1;a jsonb;e career_task_effects_v1;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select * into i from career_task_intents_v1 where user_id=p_user and intent_id=p_intent for update;
 select value into a from career_watch_kv where user_id=p_user and key='career:account';
 if a is null or i.intent_id is null or i.state<>'claimed' or p_lease is distinct from i.lease_token or p_task is distinct from i.task_id or i.expires_at<=now() or i.privacy_epoch is distinct from coalesce((a->>'epoch')::bigint,0) or i.authority_account_version is distinct from (a->>'version')::bigint or (p_operation<>'destination_readback' and a->'paused'='true'::jsonb) then raise exception 'task authority revoked';end if;
 if coalesce(p_operation,'') not in ('open','form','fill','answers','atReview','armForSubmit','submit','submissionState','destination_readback','read_public_page') or (i.binding->>'action'='research' and p_operation<>'read_public_page') or (i.binding->>'action'<>'research' and p_operation='read_public_page') or (i.binding->>'action'='prepare' and p_operation in ('armForSubmit','submit')) or (i.binding->>'action'='reconcile' and p_operation<>'destination_readback') then raise exception 'task operation not authorized';end if;
 if coalesce(p_effect_key,'') !~ '^[a-f0-9]{64}$' or p_bindings is distinct from i.binding then raise exception 'task effect binding mismatch';end if;
 if p_operation<>'destination_readback' and exists(select 1 from career_task_effects_v1 where user_id=p_user and task_id=p_task and state in ('started','uncertain')) then raise exception 'task effect outcome uncertain';end if;
 if i.spent+i.reserved>=i.budget_limit then raise exception 'task budget exhausted';end if;
 insert into career_task_effects_v1(user_id,intent_id,effect_key,task_id,operation,state) values(p_user,p_intent,p_effect_key,p_task,p_operation,'reserved') returning * into e;
 update career_task_intents_v1 set reserved=reserved+1 where user_id=p_user and intent_id=p_intent;
 return jsonb_build_object('token',e.token,'effectKey',e.effect_key,'state',e.state);
end $$;$up_99d1aa83f7002151e8745fb7$;
-- supabase/sql/proposals/career_model_budget_v1.sql statement 1
EXECUTE $up_3d21cb91c91d19b883580948$-- SOURCE-ONLY proposal. No campaign row is seeded: absence/unreconciled state
-- must deny calls. Muse must scaffold a forward migration and reconcile the
-- original shared $5 before any enablement. No real allowance is created here.
create table public.career_model_campaign_v1 (
 campaign text primary key check(campaign='owner-shared-5usd'),
 provider text not null check(provider='openai'), model text not null,
 price_key text not null check(price_key ~ '^[a-f0-9]{64}$'),
 limit_micros bigint not null check(limit_micros between 1 and 5000000),
 opening_micros bigint not null check(opening_micros>=0),
 current_micros bigint not null default 0 check(current_micros>=0),
 reconciled boolean not null default false, expires_at timestamptz not null,
 check(opening_micros+current_micros<=limit_micros)
);$up_3d21cb91c91d19b883580948$;
-- supabase/sql/proposals/career_model_budget_v1.sql statement 2
EXECUTE $up_09b6cbef75e6cae708e4d898$
create table public.career_model_reservations_v1 (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 thread_id uuid not null references agent_threads(id), turn_key text not null, request_hash text not null,
 payload_hash text not null, provider text not null, model text not null, price_key text not null, revision bigint not null, account_version bigint not null, epoch bigint not null,
 bound_micros bigint not null check(bound_micros between 1 and 25000),
 state text not null default 'reserved' check(state in ('reserved','started','recorded','unknown','not_sent')),
 cost_micros bigint, usage jsonb, expires_at timestamptz not null default now()+interval '30 seconds',
 unique(user_id,thread_id,turn_key)
);$up_09b6cbef75e6cae708e4d898$;
-- supabase/sql/proposals/career_model_budget_v1.sql statement 3
EXECUTE $up_d90672fa9d1761e9ceb15f14$
create index career_model_unknown_v1 on public.career_model_reservations_v1(state) where state='unknown';$up_d90672fa9d1761e9ceb15f14$;
-- supabase/sql/proposals/career_model_budget_v1.sql statement 4
EXECUTE $up_a8ee4be268e1489213152daa$
create index career_model_started_deadline_v1 on public.career_model_reservations_v1(expires_at) where state='started';$up_a8ee4be268e1489213152daa$;
-- supabase/sql/proposals/career_model_budget_v1.sql statement 5
EXECUTE $up_2a8d4f5780ccdac3e0570ffb$
alter table public.career_model_campaign_v1 enable row level security;$up_2a8d4f5780ccdac3e0570ffb$;
-- supabase/sql/proposals/career_model_budget_v1.sql statement 6
EXECUTE $up_bcc3e2d7122f6f7a9216259a$
alter table public.career_model_reservations_v1 enable row level security;$up_bcc3e2d7122f6f7a9216259a$;
-- supabase/sql/proposals/career_model_budget_v1.sql statement 7
EXECUTE $up_d20cf1ab2627f2bbf2a56c7f$
revoke all on public.career_model_campaign_v1,public.career_model_reservations_v1 from public,anon,authenticated;$up_d20cf1ab2627f2bbf2a56c7f$;
-- supabase/sql/proposals/career_model_budget_v1.sql statement 8
EXECUTE $up_8bef09749a394059fb46b0d5$
grant select,insert,update,delete on public.career_model_campaign_v1,public.career_model_reservations_v1 to service_role;$up_8bef09749a394059fb46b0d5$;
-- supabase/sql/proposals/career_model_budget_v1.sql statement 9
EXECUTE $up_a72f443524411cdda25cce02$
create policy career_model_campaign_backend on public.career_model_campaign_v1 for all to service_role using(true) with check(true);$up_a72f443524411cdda25cce02$;
-- supabase/sql/proposals/career_model_budget_v1.sql statement 10
EXECUTE $up_0a76128adeb6f44f7e6dd0bd$
create policy career_model_reservation_backend on public.career_model_reservations_v1 for all to service_role using(true) with check(true);$up_0a76128adeb6f44f7e6dd0bd$;
-- supabase/sql/proposals/career_model_budget_v1.sql statement 11
EXECUTE $up_6ade12624214f568526ee907$
create function public.career_model_context_current_v1(p_user uuid,p_thread uuid,p_revision bigint,p_version bigint,p_epoch bigint) returns boolean language sql security invoker set search_path=public,pg_temp as $$
 select exists(select 1 from agent_threads t left join agent_flow_state f on f.thread_id=t.id and f.user_id=p_user left join career_watch_kv a on a.user_id=p_user and a.key='career:account'
 where t.id=p_thread and t.user_id=p_user and coalesce((f.state#>>'{career,revision}')::bigint,0)=p_revision and coalesce((a.value->>'version')::bigint,0)=p_version and coalesce((a.value->>'epoch')::bigint,0)=p_epoch and a.value->'paused' is distinct from 'true'::jsonb);
$$;$up_6ade12624214f568526ee907$;
-- supabase/sql/proposals/career_model_budget_v1.sql statement 12
EXECUTE $up_855c2bf7e623a8a56358a9d1$
create function public.career_model_budget_reserve_v1(p_user uuid,p_thread uuid,p_key text,p_hash text,p_payload text,p_revision bigint,p_version bigint,p_epoch bigint,p_provider text,p_model text,p_price text,p_bound bigint) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare c career_model_campaign_v1;r career_model_reservations_v1;
begin
 if p_user is null or p_thread is null or coalesce(p_key,'') !~ '^[A-Za-z0-9_-]{1,128}$' or coalesce(p_hash,'') !~ '^[a-f0-9]{64}$' or coalesce(p_payload,'') !~ '^[a-f0-9]{64}$' or coalesce(p_bound,0) not between 1 and 25000 or p_revision is null or p_version is null or p_epoch is null then return jsonb_build_object('ok',false,'reason','invalid_request');end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 if not career_model_context_current_v1(p_user,p_thread,p_revision,p_version,p_epoch) then return jsonb_build_object('ok',false,'reason','context_changed');end if;
 select * into c from career_model_campaign_v1 where campaign='owner-shared-5usd' for update;
 if c.campaign is null or not c.reconciled or c.expires_at<=now() or c.provider is distinct from p_provider or c.model is distinct from p_model or c.price_key is distinct from p_price then return jsonb_build_object('ok',false,'reason','budget_unavailable');end if;
 select * into r from career_model_reservations_v1 where user_id=p_user and thread_id=p_thread and turn_key=p_key;
 if r.id is not null then return jsonb_build_object('ok',false,'reason',case when r.request_hash<>p_hash or r.payload_hash<>p_payload then 'turn_key_conflict' else 'already_reserved' end);end if;
 -- A crashed caller may never settle its started ticket. After the receipt
 -- deadline it is uncertain too; its full bound remains charged.
 if (select count(*) from (select 1 from career_model_reservations_v1 where state='unknown' or (state='started' and expires_at<=now()) limit 3) uncertain)>=3 then return jsonb_build_object('ok',false,'reason','usage_review_required');end if;
 if c.opening_micros+c.current_micros+p_bound>c.limit_micros then return jsonb_build_object('ok',false,'reason','budget_exhausted');end if;
 insert into career_model_reservations_v1(user_id,thread_id,turn_key,request_hash,payload_hash,provider,model,price_key,revision,account_version,epoch,bound_micros)values(p_user,p_thread,p_key,p_hash,p_payload,p_provider,p_model,p_price,p_revision,p_version,p_epoch,p_bound) returning * into r;
 update career_model_campaign_v1 set current_micros=current_micros+p_bound where campaign=c.campaign;
 return jsonb_build_object('ok',true,'ticket',r.id,'boundMicros',r.bound_micros);
end $$;$up_855c2bf7e623a8a56358a9d1$;
-- supabase/sql/proposals/career_model_budget_v1.sql statement 13
EXECUTE $up_788e48df93c13f8a2c93def6$
create function public.career_model_budget_consume_v1(p_user uuid,p_ticket uuid) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare r career_model_reservations_v1;c career_model_campaign_v1;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select * into r from career_model_reservations_v1 where id=p_ticket and user_id=p_user for update;
 select * into c from career_model_campaign_v1 where campaign='owner-shared-5usd' for update;
 if r.id is null or r.state<>'reserved' or r.expires_at<=now() or c.campaign is null or not c.reconciled or c.expires_at<=now() or c.provider is distinct from r.provider or c.model is distinct from r.model or c.price_key is distinct from r.price_key or not career_model_context_current_v1(p_user,r.thread_id,r.revision,r.account_version,r.epoch) then return jsonb_build_object('ok',false,'reason','context_changed');end if;
 -- Admission is not dispatch. Recheck the global stop under the same campaign
 -- lock used by settlement, including tickets granted before another owner
 -- tripped it. A refused reserved ticket can still settle as not_sent.
 if (select count(*) from (select 1 from career_model_reservations_v1 where state='unknown' or (state='started' and expires_at<=now()) limit 3) uncertain)>=3 then return jsonb_build_object('ok',false,'reason','usage_review_required');end if;
 update career_model_reservations_v1 set state='started' where id=r.id;
 return jsonb_build_object('ok',true,'ticket',r.id);
end $$;$up_788e48df93c13f8a2c93def6$;
-- supabase/sql/proposals/career_model_budget_v1.sql statement 14
EXECUTE $up_a0cbcdc42595b31a22e0c731$
create function public.career_model_budget_settle_v1(p_user uuid,p_ticket uuid,p_outcome text,p_cost bigint,p_usage jsonb) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare r career_model_reservations_v1;charged bigint;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select * into r from career_model_reservations_v1 where id=p_ticket and user_id=p_user for update;
 if r.id is null or coalesce(p_outcome,'') not in ('recorded','unknown','not_sent') then raise exception 'invalid owned model settlement';end if;
 if (p_outcome='not_sent' and (r.state not in ('reserved','not_sent') or p_cost is distinct from 0)) or (p_outcome='recorded' and (r.state not in ('started','recorded') or p_cost is null or p_cost<0 or p_cost>r.bound_micros or jsonb_typeof(p_usage) is distinct from 'object')) or (p_outcome='unknown' and r.state not in ('started','unknown')) then raise exception 'invalid model effect outcome';end if;
 charged:=case when p_outcome='unknown' then r.bound_micros else p_cost end;
 if r.state in ('recorded','unknown','not_sent') then
  if r.state<>p_outcome or r.cost_micros is distinct from charged or r.usage is distinct from p_usage then raise exception 'model settlement conflict';end if;
 else
  perform 1 from career_model_campaign_v1 where campaign='owner-shared-5usd' for update;
  if not found then raise exception 'model campaign missing during settlement';end if;
  update career_model_campaign_v1 set current_micros=current_micros-r.bound_micros+charged where campaign='owner-shared-5usd';
  update career_model_reservations_v1 set state=p_outcome,cost_micros=charged,usage=p_usage where id=r.id;
 end if;
 return jsonb_build_object('ok',true,'state',p_outcome,'contextCurrent',career_model_context_current_v1(p_user,r.thread_id,r.revision,r.account_version,r.epoch));
end $$;$up_a0cbcdc42595b31a22e0c731$;
-- supabase/sql/proposals/career_model_budget_v1.sql statement 15
EXECUTE $up_b97778f190960d43dc0b7868$
revoke all on function public.career_model_context_current_v1(uuid,uuid,bigint,bigint,bigint),public.career_model_budget_reserve_v1(uuid,uuid,text,text,text,bigint,bigint,bigint,text,text,text,bigint),public.career_model_budget_consume_v1(uuid,uuid),public.career_model_budget_settle_v1(uuid,uuid,text,bigint,jsonb) from public,anon,authenticated;$up_b97778f190960d43dc0b7868$;
-- supabase/sql/proposals/career_model_budget_v1.sql statement 16
EXECUTE $up_d252fe626135c415fbdef7c4$
grant execute on function public.career_model_context_current_v1(uuid,uuid,bigint,bigint,bigint),public.career_model_budget_reserve_v1(uuid,uuid,text,text,text,bigint,bigint,bigint,text,text,text,bigint),public.career_model_budget_consume_v1(uuid,uuid),public.career_model_budget_settle_v1(uuid,uuid,text,bigint,jsonb) to service_role;$up_d252fe626135c415fbdef7c4$;
-- supabase/sql/proposals/career_model_context_v2.sql statement 1
EXECUTE $up_19b0ce459629cc65636f98fb$-- SOURCE-ONLY read projection; no migration/deployment or allowance is seeded.
-- Only host-stamped, committed receipts enter dialogue. Legacy chat/audit rows
-- cannot silently become active context. Owner-wide barriers cut older drafts.
create function public.career_model_context_barrier_v2(p_user uuid,p_epoch bigint,p_version bigint)
returns bigint language sql security invoker set search_path=public,pg_temp as $$
 with stamped as (
 select (value#>>'{response,meta,career_dialogue,account_version}')::bigint v,
 value#>>'{response,meta,career_dialogue,barrier}'='true' barrier
 from career_watch_kv where user_id=p_user and key like 'career:turn:%' and value->>'epoch'=p_epoch::text
 and value#>>'{response,meta,career_dialogue,version}'='career_dialogue/v2'
 ), owned_versions as (select v,bool_or(barrier) barrier from stamped where v between 1 and p_version group by v),
 ordered as (select v,barrier,lag(v,1,0::bigint)over(order by v) previous from owned_versions)
 select greatest(coalesce(max(v)filter(where barrier),0),coalesce(max(case when v>previous+1 then v-1 else 0 end),0),case when coalesce(max(v),0)<p_version then p_version else 0 end) from ordered;
$$;$up_19b0ce459629cc65636f98fb$;
-- supabase/sql/proposals/career_model_context_v2.sql statement 2
EXECUTE $up_f1465d3a8c18d778af78c213$
revoke all on function public.career_model_context_barrier_v2(uuid,bigint,bigint) from public,anon,authenticated;$up_f1465d3a8c18d778af78c213$;
-- supabase/sql/proposals/career_model_context_v2.sql statement 3
EXECUTE $up_76688272984b7889e058bf18$
grant execute on function public.career_model_context_barrier_v2(uuid,bigint,bigint) to service_role;$up_76688272984b7889e058bf18$;
-- supabase/sql/proposals/career_model_context_v2.sql statement 4
EXECUTE $up_e6ea281285ad2b952b5ddc34$

create function public.career_model_context_read_v2(p_user uuid,p_thread uuid,p_revision bigint,p_version bigint,p_epoch bigint)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare barrier bigint; dialogue jsonb; draft jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 if not career_model_context_current_v1(p_user,p_thread,p_revision,p_version,p_epoch) then return jsonb_build_object('ok',false,'reason','context_changed');end if;
 barrier:=career_model_context_barrier_v2(p_user,p_epoch,p_version);
 select coalesce(jsonb_agg(x.body order by x.n),'[]'::jsonb) into dialogue from (
 select (value#>>'{response,meta,career_dialogue,account_version}')::bigint n,
 jsonb_build_object('user',left(value#>>'{response,meta,career_dialogue,user_text}',1200),'assistant',left(value#>>'{response,reply}',1800)) body
 from career_watch_kv where user_id=p_user and key like 'career:turn:'||p_thread||':%' and value->>'epoch'=p_epoch::text
 and value#>>'{response,meta,career_dialogue,version}'='career_dialogue/v2'
 and (value#>>'{response,meta,career_dialogue,account_version}')::bigint>barrier
 and (value#>>'{response,meta,career_dialogue,account_version}')::bigint<=p_version
 order by n desc limit 8) x;
 select value#>'{response,meta,career_model,current_draft}' into draft from career_watch_kv
 where user_id=p_user and key like 'career:turn:'||p_thread||':%' and value->>'epoch'=p_epoch::text
 and value#>>'{response,meta,career_dialogue,version}'='career_dialogue/v2'
 and (value#>>'{response,meta,career_dialogue,account_version}')::bigint>barrier
 and (value#>>'{response,meta,career_dialogue,account_version}')::bigint<=p_version
 and value#>>'{response,meta,career_model,current_draft,status}'='draft_not_sent'
 order by (value#>>'{response,meta,career_dialogue,account_version}')::bigint desc limit 1;
 return jsonb_build_object('ok',true,'user_id',p_user,'thread_id',p_thread,'revision',p_revision,'account_version',p_version,'epoch',p_epoch,'barrier_version',barrier,'dialogue',dialogue,'current_draft',draft);
end $$;$up_e6ea281285ad2b952b5ddc34$;
-- supabase/sql/proposals/career_model_context_v2.sql statement 5
EXECUTE $up_a4ce7ee7cec7303fc9a74140$
revoke all on function public.career_model_context_read_v2(uuid,uuid,bigint,bigint,bigint) from public,anon,authenticated;$up_a4ce7ee7cec7303fc9a74140$;
-- supabase/sql/proposals/career_model_context_v2.sql statement 6
EXECUTE $up_748e7c8c04d08cbe8f381305$
grant execute on function public.career_model_context_read_v2(uuid,uuid,bigint,bigint,bigint) to service_role;$up_748e7c8c04d08cbe8f381305$;
-- supabase/sql/proposals/career_model_context_v2.sql statement 7
EXECUTE $up_cde53bbd3fc56e2d96d4ac75$

-- Exact replay is free only while no newer owner-wide privacy/correction
-- barrier revokes that response. Old audit text is not a new active reply.
create function public.career_model_replay_check_v2(p_user uuid,p_thread uuid,p_key text,p_hash text)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare a jsonb; r jsonb; barrier bigint; v bigint;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 if not exists(select 1 from agent_threads where id=p_thread and user_id=p_user) then return jsonb_build_object('ok',false);end if;
 select value into a from career_watch_kv where user_id=p_user and key='career:account';
 select value into r from career_watch_kv where user_id=p_user and key='career:turn:'||p_thread||':'||p_key;
 if r->>'hash' is distinct from p_hash or r->>'epoch' is distinct from coalesce(a->>'epoch','0') or r#>>'{response,meta,career_dialogue,version}' is distinct from 'career_dialogue/v2' then return jsonb_build_object('ok',false);end if;
 barrier:=career_model_context_barrier_v2(p_user,coalesce((a->>'epoch')::bigint,0),coalesce((a->>'version')::bigint,0));
 v:=(r#>>'{response,meta,career_dialogue,account_version}')::bigint;
 return jsonb_build_object('ok',coalesce(v>barrier or (v=barrier and r#>>'{response,meta,career_dialogue,barrier}'='true'),false));
end $$;$up_cde53bbd3fc56e2d96d4ac75$;
-- supabase/sql/proposals/career_model_context_v2.sql statement 8
EXECUTE $up_bb4ae0f79683edc72b61bc1a$
revoke all on function public.career_model_replay_check_v2(uuid,uuid,text,text) from public,anon,authenticated;$up_bb4ae0f79683edc72b61bc1a$;
-- supabase/sql/proposals/career_model_context_v2.sql statement 9
EXECUTE $up_65aea9d1d345875ccff66b6f$
grant execute on function public.career_model_replay_check_v2(uuid,uuid,text,text) to service_role;$up_65aea9d1d345875ccff66b6f$;
-- supabase/sql/proposals/career_model_pair_budget_v2.sql statement 1
EXECUTE $up_0618ad49307acb20b4f37da3$-- SOURCE-ONLY additive proposal. No policy, campaign, allowance or credentials
-- are seeded. Real enablement requires Muse's review and reconciliation of the
-- SAME original shared allowance. Native fixtures are explicitly disposable.
create table public.career_model_pair_policy_v2 (
 policy_digest text primary key check(policy_digest ~ '^[a-f0-9]{64}$'),
 provider text not null check(provider='openai'),
 model text not null check(model in ('gpt-5-nano','gpt-5-mini','gpt-4.1-nano')),
 price_key text not null check(price_key ~ '^[a-f0-9]{64}$'),
 input_nanos bigint not null check(input_nanos between 1 and 10000000),
 cached_nanos bigint not null check(cached_nanos between 0 and input_nanos),
 output_nanos bigint not null check(output_nanos between 1 and 10000000),
 generation_config_digest text not null check(generation_config_digest ~ '^[a-f0-9]{64}$'),
 verification_config_digest text not null check(verification_config_digest ~ '^[a-f0-9]{64}$'),
 max_input_bound bigint not null check(max_input_bound between 1 and 1000000),
 max_generation_output bigint not null check(max_generation_output between 1 and 16384),
 max_verification_output bigint not null check(max_verification_output between 1 and 16384),
 active boolean not null default false
);$up_0618ad49307acb20b4f37da3$;
-- supabase/sql/proposals/career_model_pair_budget_v2.sql statement 2
EXECUTE $up_d09a7b48ea17f7cee9da4aea$
-- Equivalent existing storage owns the global obligation and monthly slot.
create unique index career_pair_thread_owner_v2 on public.agent_threads(id,user_id);$up_d09a7b48ea17f7cee9da4aea$;
-- supabase/sql/proposals/career_model_pair_budget_v2.sql statement 3
EXECUTE $up_8cfb0c8e3a6055666c691d5d$
create unique index career_pair_ticket_owner_v2 on public.career_model_reservations_v1(id,user_id,thread_id);$up_8cfb0c8e3a6055666c691d5d$;
-- supabase/sql/proposals/career_model_pair_budget_v2.sql statement 4
EXECUTE $up_a67f682356d15c3c5d24e5c1$
create unique index career_pair_monthly_owner_v2 on public.agent_model_calls(id,user_id,thread_id);$up_a67f682356d15c3c5d24e5c1$;
-- supabase/sql/proposals/career_model_pair_budget_v2.sql statement 5
EXECUTE $up_bd8f6100015b4e16934efecc$
create table public.career_model_pairs_v2 (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 thread_id uuid not null,
 turn_key text not null check(turn_key ~ '^[A-Za-z0-9_-]{1,128}$'),
 request_hash text not null check(request_hash ~ '^[a-f0-9]{64}$'),
 revision bigint not null check(revision>=0),account_version bigint not null check(account_version>=0),epoch bigint not null check(epoch>=0),
 policy_digest text not null references public.career_model_pair_policy_v2(policy_digest),
 generation_payload text not null check(generation_payload ~ '^[a-f0-9]{64}$'),
 verification_envelope text not null check(verification_envelope ~ '^[a-f0-9]{64}$'),
 parent_bound_micros bigint not null check(parent_bound_micros between 2 and 50000),
 created_at timestamptz not null default clock_timestamp(),deadline timestamptz not null,
 publication_state text not null default 'not_published' check(publication_state in ('not_published','verified_uncommitted','published','stale_context')),
 settlement_revision bigint not null default 0 check(settlement_revision between 0 and 2),
 unique(user_id,thread_id,turn_key),unique(id,user_id,thread_id),
 foreign key(thread_id,user_id)references public.agent_threads(id,user_id)
);$up_bd8f6100015b4e16934efecc$;
-- supabase/sql/proposals/career_model_pair_budget_v2.sql statement 6
EXECUTE $up_cd7fc2be8b50cfead0e5bb9b$
create table public.career_model_pair_legs_v2 (
 pair_id uuid not null,user_id uuid not null,thread_id uuid not null,
 kind text not null check(kind in ('generation','verification')),
 ticket_id uuid not null unique,monthly_id uuid unique,
 config_digest text not null check(config_digest ~ '^[a-f0-9]{64}$'),
 input_bound bigint not null check(input_bound between 1 and 1000000),output_bound bigint not null check(output_bound between 1 and 16384),
 reserved_envelope text not null check(reserved_envelope ~ '^[a-f0-9]{64}$'),
 dispatched_payload text check(dispatched_payload ~ '^[a-f0-9]{64}$'),dispatched_input bigint,dispatched_output bigint,
 started_at timestamptz,settled_at timestamptz,settlement_request_hash text check(settlement_request_hash ~ '^[a-f0-9]{64}$'),
 raw_usage_receipt jsonb,provider_response_id text,
 primary key(pair_id,kind),
 foreign key(pair_id,user_id,thread_id)references public.career_model_pairs_v2(id,user_id,thread_id)on delete cascade,
 foreign key(ticket_id,user_id,thread_id)references public.career_model_reservations_v1(id,user_id,thread_id),
 foreign key(monthly_id,user_id,thread_id)references public.agent_model_calls(id,user_id,thread_id),
 check((dispatched_payload is null and dispatched_input is null and dispatched_output is null and started_at is null)or(dispatched_payload is not null and dispatched_input between 1 and input_bound and dispatched_output between 1 and output_bound and started_at is not null))
);$up_cd7fc2be8b50cfead0e5bb9b$;
-- supabase/sql/proposals/career_model_pair_budget_v2.sql statement 7
EXECUTE $up_5382e1719cdcc229e75911d6$
create index career_pair_owner_thread_v2 on public.career_model_pairs_v2(user_id,thread_id);$up_5382e1719cdcc229e75911d6$;
-- supabase/sql/proposals/career_model_pair_budget_v2.sql statement 8
EXECUTE $up_2dc98044324d676a48d7d8ef$
alter table public.career_model_pair_policy_v2 enable row level security;$up_2dc98044324d676a48d7d8ef$;
-- supabase/sql/proposals/career_model_pair_budget_v2.sql statement 9
EXECUTE $up_2f61c9f6d09367d698663865$
alter table public.career_model_pairs_v2 enable row level security;$up_2f61c9f6d09367d698663865$;
-- supabase/sql/proposals/career_model_pair_budget_v2.sql statement 10
EXECUTE $up_faf20a33468af5e68c3bbfe1$
alter table public.career_model_pair_legs_v2 enable row level security;$up_faf20a33468af5e68c3bbfe1$;
-- supabase/sql/proposals/career_model_pair_budget_v2.sql statement 11
EXECUTE $up_ea539a22692159567323ab9f$
revoke all on public.career_model_pair_policy_v2,public.career_model_pairs_v2,public.career_model_pair_legs_v2 from public,anon,authenticated;$up_ea539a22692159567323ab9f$;
-- supabase/sql/proposals/career_model_pair_budget_v2.sql statement 12
EXECUTE $up_0c9239155c064b41a7ca693b$
grant select,insert on public.career_model_pair_policy_v2 to service_role;$up_0c9239155c064b41a7ca693b$;
-- supabase/sql/proposals/career_model_pair_budget_v2.sql statement 13
EXECUTE $up_8950f229aa34f69f518faa12$
grant update(active)on public.career_model_pair_policy_v2 to service_role;$up_8950f229aa34f69f518faa12$;
-- supabase/sql/proposals/career_model_pair_budget_v2.sql statement 14
EXECUTE $up_b48e75092622f6a2e24a69f7$
grant select,insert,update,delete on public.career_model_pairs_v2,public.career_model_pair_legs_v2 to service_role;$up_b48e75092622f6a2e24a69f7$;
-- supabase/sql/proposals/career_model_pair_budget_v2.sql statement 15
EXECUTE $up_6ac599bf1375abb000d8884b$
grant select on public.agent_usage to service_role;$up_6ac599bf1375abb000d8884b$;
-- supabase/sql/proposals/career_model_pair_budget_v2.sql statement 16
EXECUTE $up_568ec6ccf4ab5c508b2767b0$
-- Existing monthly RLS only defines client owner reads. Keep that policy and
-- RLS intact; invoker RPCs need explicit backend read and reserved-slot refund.
-- Recorded monthly rows remain outside this delete policy.
create policy career_pair_monthly_backend_read_v2 on public.agent_model_calls for select to service_role using(true);$up_568ec6ccf4ab5c508b2767b0$;
-- supabase/sql/proposals/career_model_pair_budget_v2.sql statement 17
EXECUTE $up_6cd665b959470803db2691d8$
create policy career_pair_monthly_unsent_refund_v2 on public.agent_model_calls for delete to service_role using(state='reserved'and usage is null);$up_6cd665b959470803db2691d8$;
-- supabase/sql/proposals/career_model_pair_budget_v2.sql statement 18
EXECUTE $up_7884c7580bcc32bde52c6e05$
create policy career_pair_policy_backend_v2 on public.career_model_pair_policy_v2 for all to service_role using(true)with check(true);$up_7884c7580bcc32bde52c6e05$;
-- supabase/sql/proposals/career_model_pair_budget_v2.sql statement 19
EXECUTE $up_08d9911ecddb4e8f8dd5bb21$
create policy career_pair_parent_backend_v2 on public.career_model_pairs_v2 for all to service_role using(true)with check(true);$up_08d9911ecddb4e8f8dd5bb21$;
-- supabase/sql/proposals/career_model_pair_budget_v2.sql statement 20
EXECUTE $up_cf42bb6565dee3ccbf7a8dda$
create policy career_pair_leg_backend_v2 on public.career_model_pair_legs_v2 for all to service_role using(true)with check(true);$up_cf42bb6565dee3ccbf7a8dda$;
-- supabase/sql/proposals/career_model_pair_budget_v2.sql statement 21
EXECUTE $up_b5b409f020640d2e7d5c3897$

create function public.career_model_pair_read_v2(p_user uuid,p_pair uuid)returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare p career_model_pairs_v2;g jsonb;v jsonb;known bigint;held bigint;uncertain bigint;terminal bigint;possible bigint;confirmed bigint;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select * into p from career_model_pairs_v2 where id=p_pair and user_id=p_user;
 if p.id is null or not exists(select 1 from agent_threads where id=p.thread_id and user_id=p_user)then return jsonb_build_object('ok',false,'reason','not_found');end if;
 select jsonb_object_agg(l.kind,jsonb_build_object('kind',l.kind,'ticket',r.id,'monthly_call_id',l.monthly_id,'bound_micros',r.bound_micros,'state',r.state,'cost_micros',r.cost_micros,'dispatch_payload',l.dispatched_payload,'config_digest',l.config_digest,'raw_usage_receipt',case when r.state='recorded'then l.raw_usage_receipt else null end,'provider_response_id',case when r.state='recorded'then l.provider_response_id else null end,'settled_at',l.settled_at,'receipt_ref',case when l.settlement_request_hash is not null then l.ticket_id::text else null end)) into g
 from career_model_pair_legs_v2 l join career_model_reservations_v1 r on r.id=l.ticket_id and r.user_id=l.user_id and r.thread_id=l.thread_id where l.pair_id=p.id and l.user_id=p_user and l.thread_id=p.thread_id;
 v:=g->'verification';g:=g->'generation';
 select coalesce(sum(r.cost_micros)filter(where r.state='recorded'),0),coalesce(sum(r.bound_micros)filter(where r.state='reserved'),0),coalesce(sum(r.bound_micros)filter(where r.state in('started','unknown')),0),count(*)filter(where r.state in('recorded','unknown','not_sent')),count(*)filter(where r.state in('started','recorded','unknown')),count(*)filter(where r.state='recorded'and l.raw_usage_receipt is not null)
 into known,held,uncertain,terminal,possible,confirmed from career_model_pair_legs_v2 l join career_model_reservations_v1 r on r.id=l.ticket_id and r.user_id=p_user and r.thread_id=p.thread_id where l.pair_id=p.id and l.user_id=p_user and l.thread_id=p.thread_id;
 return jsonb_build_object('ok',true,'pair_id',p.id,'generation',g,'verification',v,'parent_bound_micros',p.parent_bound_micros,'known_cost_micros',known,'held_micros',held,'uncertain_micros',uncertain,'accounting_state',case when uncertain>0 then 'uncertain'when terminal=2 then 'settled'else 'reserved'end,'publication_state',p.publication_state,'settlement_revision',p.settlement_revision,'deadline',p.deadline,'provider_calls_possible',possible,'provider_calls_confirmed',confirmed,'dispatch_count_basis','started legs may have dispatched; only recorded receipts confirm responses','contextCurrent',career_model_context_current_v1(p_user,p.thread_id,p.revision,p.account_version,p.epoch));
end $$;$up_b5b409f020640d2e7d5c3897$;
-- supabase/sql/proposals/career_model_pair_budget_v2.sql statement 22
EXECUTE $up_cfafcc8b401a150a99a889bd$

create function public.career_model_pair_reserve_v2(p_user uuid,p_thread uuid,p_key text,p_hash text,p_revision bigint,p_version bigint,p_epoch bigint,p_policy text,p_generation_payload text,p_verification_envelope text,p_generation_input bigint,p_generation_output bigint,p_verification_input bigint,p_verification_output bigint)returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare p career_model_pairs_v2;pol career_model_pair_policy_v2;c career_model_campaign_v1;gb bigint;vb bigint;g jsonb;v jsonb;gm jsonb;vm jsonb;result jsonb;
begin
 if p_user is null or p_thread is null or coalesce(p_key,'')!~'^[A-Za-z0-9_-]{1,128}$'or coalesce(p_hash,'')!~'^[a-f0-9]{64}$'or coalesce(p_policy,'')!~'^[a-f0-9]{64}$'or coalesce(p_generation_payload,'')!~'^[a-f0-9]{64}$'or coalesce(p_verification_envelope,'')!~'^[a-f0-9]{64}$'or p_revision is null or p_version is null or p_epoch is null or p_revision<0 or p_version<0 or p_epoch<0 then return jsonb_build_object('ok',false,'reason','invalid_request');end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 if not career_model_context_current_v1(p_user,p_thread,p_revision,p_version,p_epoch)then return jsonb_build_object('ok',false,'reason','context_changed');end if;
 select * into p from career_model_pairs_v2 where user_id=p_user and thread_id=p_thread and turn_key=p_key;
 if p.id is not null then
  if p.request_hash is distinct from p_hash or p.policy_digest is distinct from p_policy or p.generation_payload is distinct from p_generation_payload or p.verification_envelope is distinct from p_verification_envelope or p.revision<>p_revision or p.account_version<>p_version or p.epoch<>p_epoch or not exists(select 1 from career_model_pair_legs_v2 where pair_id=p.id and kind='generation'and input_bound=p_generation_input and output_bound=p_generation_output)or not exists(select 1 from career_model_pair_legs_v2 where pair_id=p.id and kind='verification'and input_bound=p_verification_input and output_bound=p_verification_output)then return jsonb_build_object('ok',false,'reason','turn_key_conflict');end if;
  return career_model_pair_read_v2(p_user,p.id)||jsonb_build_object('is_new',false);
 end if;
 select * into pol from career_model_pair_policy_v2 where policy_digest=p_policy and active for share;
 if pol.policy_digest is null then return jsonb_build_object('ok',false,'reason','policy_unavailable');end if;
 if coalesce(p_generation_input,0)not between 1 and pol.max_input_bound or coalesce(p_verification_input,0)not between 1 and pol.max_input_bound or coalesce(p_generation_output,0)not between 1 and pol.max_generation_output or coalesce(p_verification_output,0)not between 1 and pol.max_verification_output then return jsonb_build_object('ok',false,'reason','invalid_bounds');end if;
 gb:=(p_generation_input*pol.input_nanos+p_generation_output*pol.output_nanos+999)/1000;vb:=(p_verification_input*pol.input_nanos+p_verification_output*pol.output_nanos+999)/1000;
 if gb not between 1 and 25000 or vb not between 1 and 25000 then return jsonb_build_object('ok',false,'reason','invalid_bounds');end if;
 select * into c from career_model_campaign_v1 where campaign='owner-shared-5usd'for update;
 if c.campaign is null or not c.reconciled or c.expires_at<=clock_timestamp()or c.provider is distinct from pol.provider or c.model is distinct from pol.model or c.price_key is distinct from pol.price_key then return jsonb_build_object('ok',false,'reason','budget_unavailable');end if;
 if(select count(*)from(select 1 from career_model_reservations_v1 where state='unknown'or(state='started'and expires_at<=clock_timestamp())limit 3)u)>=3 then return jsonb_build_object('ok',false,'reason','usage_review_required');end if;
 if c.opening_micros+c.current_micros+gb+vb>c.limit_micros then return jsonb_build_object('ok',false,'reason','budget_exhausted');end if;
 -- The subtransaction rolls back BOTH global holds and any first monthly slot
 -- when the second slot is unavailable. Legacy monthly admission holds its
 -- existing auth-user quota lock through this outer transaction.
 begin
  insert into career_model_pairs_v2(user_id,thread_id,turn_key,request_hash,revision,account_version,epoch,policy_digest,generation_payload,verification_envelope,parent_bound_micros,deadline)values(p_user,p_thread,p_key,p_hash,p_revision,p_version,p_epoch,p_policy,p_generation_payload,p_verification_envelope,gb+vb,clock_timestamp()+interval '20 seconds')returning * into p;
  g:=career_model_budget_reserve_v1(p_user,p_thread,'p2_'||replace(p.id::text,'-','')||'_g',p_hash,p_generation_payload,p_revision,p_version,p_epoch,pol.provider,pol.model,pol.price_key,gb);
  v:=career_model_budget_reserve_v1(p_user,p_thread,'p2_'||replace(p.id::text,'-','')||'_v',p_hash,p_verification_envelope,p_revision,p_version,p_epoch,pol.provider,pol.model,pol.price_key,vb);
  if g->>'ok'is distinct from 'true'or v->>'ok'is distinct from 'true'then raise exception 'paired global reservation could not be confirmed';end if;
  gm:=agent_model_call_reserve(p_user,p_thread,p.id,0,pol.model);vm:=agent_model_call_reserve(p_user,p_thread,p.id,1,pol.model);
  if gm->>'ok'is distinct from 'true'or vm->>'ok'is distinct from 'true'then raise sqlstate 'P0003'using message='paired monthly quota unavailable';end if;
  update career_model_reservations_v1 set expires_at=p.deadline where id in((g->>'ticket')::uuid,(v->>'ticket')::uuid)and user_id=p_user and thread_id=p_thread;
  insert into career_model_pair_legs_v2(pair_id,user_id,thread_id,kind,ticket_id,monthly_id,config_digest,input_bound,output_bound,reserved_envelope)values(p.id,p_user,p_thread,'generation',(g->>'ticket')::uuid,(gm->>'call_id')::uuid,pol.generation_config_digest,p_generation_input,p_generation_output,p_generation_payload),(p.id,p_user,p_thread,'verification',(v->>'ticket')::uuid,(vm->>'call_id')::uuid,pol.verification_config_digest,p_verification_input,p_verification_output,p_verification_envelope);
  result:=career_model_pair_read_v2(p_user,p.id)||jsonb_build_object('is_new',true);
 exception when sqlstate 'P0003'then return jsonb_build_object('ok',false,'reason','monthly_limit');end;
 return result;
end $$;$up_cfafcc8b401a150a99a889bd$;
-- supabase/sql/proposals/career_model_pair_budget_v2.sql statement 23
EXECUTE $up_494ed021fc73bfcafd8feeed$

create function public.career_model_leg_consume_v2(p_user uuid,p_pair uuid,p_kind text,p_payload text,p_envelope text,p_input bigint,p_output bigint)returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare p career_model_pairs_v2;l career_model_pair_legs_v2;r career_model_reservations_v1;pol career_model_pair_policy_v2;c career_model_campaign_v1;used jsonb;
begin
 if p_user is null or coalesce(p_kind,'')not in('generation','verification')or coalesce(p_payload,'')!~'^[a-f0-9]{64}$'then return jsonb_build_object('ok',false,'reason','invalid_request');end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select * into p from career_model_pairs_v2 where id=p_pair and user_id=p_user;
 select * into l from career_model_pair_legs_v2 where pair_id=p_pair and user_id=p_user and kind=p_kind for update;
 if p.id is null or l.ticket_id is null then return jsonb_build_object('ok',false,'reason','not_found');end if;
 select * into r from career_model_reservations_v1 where id=l.ticket_id and user_id=p_user and thread_id=p.thread_id for update;
 select * into pol from career_model_pair_policy_v2 where policy_digest=p.policy_digest and active for share;
 select * into c from career_model_campaign_v1 where campaign='owner-shared-5usd'for update;
 if r.id is null or r.state<>'reserved'or p.deadline<=clock_timestamp()or r.expires_at<=clock_timestamp()or not career_model_context_current_v1(p_user,p.thread_id,p.revision,p.account_version,p.epoch)then return jsonb_build_object('ok',false,'reason','context_changed');end if;
 if pol.policy_digest is null or c.campaign is null or not c.reconciled or c.expires_at<=clock_timestamp()or c.provider is distinct from pol.provider or c.model is distinct from pol.model or c.price_key is distinct from pol.price_key or r.provider is distinct from pol.provider or r.model is distinct from pol.model or r.price_key is distinct from pol.price_key or l.config_digest is distinct from(case when p_kind='generation'then pol.generation_config_digest else pol.verification_config_digest end)then return jsonb_build_object('ok',false,'reason','policy_unavailable');end if;
 if(select count(*)from(select 1 from career_model_reservations_v1 where state='unknown'or(state='started'and expires_at<=clock_timestamp())limit 3)u)>=3 then return jsonb_build_object('ok',false,'reason','usage_review_required');end if;
 if p_envelope is distinct from l.reserved_envelope or coalesce(p_input,0)not between 1 and l.input_bound or coalesce(p_output,0)not between 1 and l.output_bound or(p_kind='generation'and(p_payload is distinct from p.generation_payload or p_input<>l.input_bound or p_output<>l.output_bound))then return jsonb_build_object('ok',false,'reason','payload_conflict');end if;
 if p_kind='verification'and not exists(select 1 from career_model_pair_legs_v2 g join career_model_reservations_v1 t on t.id=g.ticket_id and t.user_id=p_user where g.pair_id=p.id and g.user_id=p_user and g.kind='generation'and t.state='recorded'and g.raw_usage_receipt is not null)then return jsonb_build_object('ok',false,'reason','generation_not_recorded');end if;
 used:=career_model_budget_consume_v1(p_user,l.ticket_id);if used->>'ok'is distinct from 'true'then return used;end if;
 update career_model_pair_legs_v2 set dispatched_payload=p_payload,dispatched_input=p_input,dispatched_output=p_output,started_at=clock_timestamp()where pair_id=p.id and user_id=p_user and kind=p_kind;
 return jsonb_build_object('ok',true,'pair_id',p.id,'kind',p_kind,'ticket',l.ticket_id,'payload_sha256',p_payload);
end $$;$up_494ed021fc73bfcafd8feeed$;
-- supabase/sql/proposals/career_model_pair_budget_v2.sql statement 24
EXECUTE $up_7df7b4fc18afdd576d8793b8$

create function public.career_model_leg_settle_v2(p_user uuid,p_pair uuid,p_kind text,p_outcome text,p_receipt jsonb)returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare p career_model_pairs_v2;l career_model_pair_legs_v2;r career_model_reservations_v1;pol career_model_pair_policy_v2;fingerprint text;valid boolean:=true;u jsonb;details jsonb;prompt bigint;completion bigint;cached bigint:=0;cost bigint;outcome text;normalized jsonb;k text;done jsonb;deleted bigint;
begin
 if p_user is null or coalesce(p_kind,'')not in('generation','verification')or coalesce(p_outcome,'')not in('recorded','unknown','not_sent')then raise exception 'invalid owned pair settlement';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select * into p from career_model_pairs_v2 where id=p_pair and user_id=p_user for update;
 select * into l from career_model_pair_legs_v2 where pair_id=p_pair and user_id=p_user and kind=p_kind for update;
 if p.id is null or l.ticket_id is null then raise exception 'invalid owned pair settlement';end if;
 select * into r from career_model_reservations_v1 where id=l.ticket_id and user_id=p_user and thread_id=p.thread_id for update;
 select * into pol from career_model_pair_policy_v2 where policy_digest=p.policy_digest;
 if r.id is null or pol.policy_digest is null then raise exception 'pair obligation unavailable';end if;
 fingerprint:=encode(sha256(convert_to(jsonb_build_object('outcome',p_outcome,'receipt',p_receipt)::text,'UTF8')),'hex');
 if l.settlement_request_hash is not null then
  if l.settlement_request_hash<>fingerprint then raise exception 'paired settlement conflict';end if;
  return career_model_pair_read_v2(p_user,p.id)||jsonb_build_object('state',r.state,'cost_micros',r.cost_micros);
 end if;
 if p_outcome='not_sent'then
  if r.state<>'reserved'or p_receipt is not null then raise exception 'started calls cannot refund';end if;
  update career_model_pair_legs_v2 set monthly_id=null where pair_id=p.id and user_id=p_user and kind=p_kind;
  delete from agent_model_calls where id=l.monthly_id and user_id=p_user and thread_id=p.thread_id and request_id=p.id and step=case when p_kind='generation'then 0 else 1 end and state='reserved'and usage is null;
  get diagnostics deleted=row_count;if deleted<>1 then raise exception 'monthly refund unconfirmed';end if;
  done:=career_model_budget_settle_v1(p_user,l.ticket_id,'not_sent',0,'{}'::jsonb);outcome:='not_sent';cost:=0;
 else
  if r.state<>'started'or l.dispatched_payload is null then raise exception 'only started legs may settle usage';end if;
  valid:=p_outcome='recorded'and jsonb_typeof(p_receipt)='object'and octet_length(p_receipt::text)<=16384;
  if valid then
   -- Finite reviewed response mapping. Configuration/pricing stay pinned to
   -- the policy model; retain the observed snapshot in the original receipt.
   valid:=p_receipt->>'version'='gateway_usage_receipt/v1'and p_receipt->>'provider'=pol.provider and p_receipt->>'configured_model'=pol.model and(p_receipt->>'response_model'=pol.model or(pol.model='gpt-5-nano'and p_receipt->>'response_model'='gpt-5-nano-2025-08-07'))and coalesce(p_receipt->>'response_id','')~'^[A-Za-z0-9_-]{1,128}$'and p_receipt->>'request_body_sha256'=l.dispatched_payload and coalesce(p_receipt->>'response_body_sha256','')~'^[a-f0-9]{64}$'and jsonb_typeof(p_receipt->'usage')='object';
   if p_receipt?'config_digest' and p_receipt->>'config_digest' is distinct from l.config_digest then valid:=false;end if;
   if exists(select 1 from jsonb_object_keys(p_receipt)t(k)where t.k not in('version','provider','configured_model','response_model','response_id','request_body_sha256','response_body_sha256','usage','config_digest'))then valid:=false;end if;
  end if;
  if coalesce(valid,false)then
   u:=p_receipt->'usage';
   if exists(select 1 from jsonb_object_keys(u)t(k)where t.k not in('prompt_tokens','completion_tokens','total_tokens','prompt_tokens_details','completion_tokens_details'))then valid:=false;end if;
   foreach k in array array['prompt_tokens','completion_tokens']loop if jsonb_typeof(u->k)is distinct from 'number'or coalesce(u->>k,'')!~'^[0-9]{1,8}$'then valid:=false;end if;end loop;
   if valid then
    prompt:=(u->>'prompt_tokens')::bigint;completion:=(u->>'completion_tokens')::bigint;
    if prompt>10000000 or completion>10000000 or prompt>l.dispatched_input or completion>l.dispatched_output then valid:=false;end if;
    if u?'total_tokens'then if jsonb_typeof(u->'total_tokens')is distinct from 'number'or coalesce(u->>'total_tokens','')!~'^[0-9]{1,8}$'then valid:=false;elsif(u->>'total_tokens')::bigint<>prompt+completion then valid:=false;end if;end if;
    details:=u->'prompt_tokens_details';
    if details is not null and details<>'null'::jsonb then
     if jsonb_typeof(details)is distinct from 'object'then valid:=false;
     else
      if exists(select 1 from jsonb_object_keys(details)t(k)where t.k not in('cached_tokens','audio_tokens'))then valid:=false;end if;
      if details?'audio_tokens'and(jsonb_typeof(details->'audio_tokens')is distinct from 'number'or coalesce(details->>'audio_tokens','')<>'0')then valid:=false;end if;
      if details?'cached_tokens'then if jsonb_typeof(details->'cached_tokens')is distinct from 'number'or coalesce(details->>'cached_tokens','')!~'^[0-9]{1,8}$'then valid:=false;else cached:=(details->>'cached_tokens')::bigint;end if;end if;
     end if;
    end if;
    details:=u->'completion_tokens_details';
    if details is not null and details<>'null'::jsonb then
     if jsonb_typeof(details)is distinct from 'object'then valid:=false;
     else
      if exists(select 1 from jsonb_object_keys(details)t(k)where t.k not in('reasoning_tokens','audio_tokens','accepted_prediction_tokens','rejected_prediction_tokens'))then valid:=false;end if;
      -- These documented fields are optional zeros for this text-only policy.
      -- Nonzero, coerced or unsupported usage never becomes a known cheap bill.
      foreach k in array array['audio_tokens','accepted_prediction_tokens','rejected_prediction_tokens']loop
       if details?k and(jsonb_typeof(details->k)is distinct from 'number'or coalesce(details->>k,'')<>'0')then valid:=false;end if;
      end loop;
      if details?'reasoning_tokens'then if jsonb_typeof(details->'reasoning_tokens')is distinct from 'number'or coalesce(details->>'reasoning_tokens','')!~'^[0-9]{1,8}$'then valid:=false;elsif(details->>'reasoning_tokens')::bigint>completion then valid:=false;end if;end if;
     end if;
    end if;
    if cached>prompt then valid:=false;end if;
    if valid then cost:=((prompt-cached)*pol.input_nanos+cached*pol.cached_nanos+completion*pol.output_nanos+999)/1000;if cost>r.bound_micros then valid:=false;end if;end if;
   end if;
  end if;
  if coalesce(valid,false)then
   normalized:=jsonb_build_object('input_tokens',prompt-cached,'output_tokens',completion,'cache_read_tokens',cached,'cache_write_tokens',0);
   perform agent_model_call_record(l.monthly_id,normalized);
   if not exists(select 1 from agent_model_calls m join agent_usage a on a.call_id=m.id and a.user_id=m.user_id and a.thread_id=m.thread_id where m.id=l.monthly_id and m.user_id=p_user and m.thread_id=p.thread_id and m.request_id=p.id and m.step=case when p_kind='generation'then 0 else 1 end and m.state='recorded'and m.usage=normalized and a.model=pol.model and a.input_tokens=prompt-cached and a.output_tokens=completion and a.cache_read_tokens=cached and a.cache_write_tokens=0)then raise exception 'monthly usage readback unconfirmed';end if;
   done:=career_model_budget_settle_v1(p_user,l.ticket_id,'recorded',cost,p_receipt);outcome:='recorded';
  else
   cost:=r.bound_micros;done:=career_model_budget_settle_v1(p_user,l.ticket_id,'unknown',null,null);outcome:='unknown';
  end if;
 end if;
 if done->>'ok'is distinct from 'true'then raise exception 'paired global settlement unconfirmed';end if;
 update career_model_pair_legs_v2 set settlement_request_hash=fingerprint,settled_at=clock_timestamp(),raw_usage_receipt=case when outcome='recorded'then p_receipt else null end,provider_response_id=case when outcome='recorded'then p_receipt->>'response_id'else null end where pair_id=p.id and user_id=p_user and kind=p_kind;
 update career_model_pairs_v2 set settlement_revision=settlement_revision+1 where id=p.id and user_id=p_user;
 return career_model_pair_read_v2(p_user,p.id)||jsonb_build_object('state',outcome,'cost_micros',cost);
end $$;$up_7df7b4fc18afdd576d8793b8$;
-- supabase/sql/proposals/career_model_pair_budget_v2.sql statement 25
EXECUTE $up_8bfca92a320e14fba8214f57$

revoke all on function public.career_model_pair_read_v2(uuid,uuid),public.career_model_pair_reserve_v2(uuid,uuid,text,text,bigint,bigint,bigint,text,text,text,bigint,bigint,bigint,bigint),public.career_model_leg_consume_v2(uuid,uuid,text,text,text,bigint,bigint),public.career_model_leg_settle_v2(uuid,uuid,text,text,jsonb)from public,anon,authenticated;$up_8bfca92a320e14fba8214f57$;
-- supabase/sql/proposals/career_model_pair_budget_v2.sql statement 26
EXECUTE $up_a06ea212774cd8b45578658b$
grant execute on function public.career_model_pair_read_v2(uuid,uuid),public.career_model_pair_reserve_v2(uuid,uuid,text,text,bigint,bigint,bigint,text,text,text,bigint,bigint,bigint,bigint),public.career_model_leg_consume_v2(uuid,uuid,text,text,text,bigint,bigint),public.career_model_leg_settle_v2(uuid,uuid,text,text,jsonb)to service_role;$up_a06ea212774cd8b45578658b$;
-- supabase/sql/proposals/career_interview_entry_v1.sql statement 1
EXECUTE $up_4eab39b303e69e4cb7a7f6ce$-- SOURCE PROPOSAL ONLY. No production application, seeds or provider calls.
-- Reuses owned KV and the existing atomic career turn commit.
create function public.career_journey_context_read_v1(p_user uuid,p_thread uuid)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare c jsonb;a jsonb;r bigint;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 if not exists(select 1 from agent_threads where id=p_thread and user_id=p_user)then return jsonb_build_object('error','owned_thread_missing');end if;
 select coalesce(value,'{}'::jsonb)into a from career_watch_kv where user_id=p_user and key='career:account';
 select coalesce((state#>>'{career,revision}')::bigint,0)into r from agent_flow_state where thread_id=p_thread and user_id=p_user;
 select value into c from career_watch_kv where user_id=p_user and key='career:journey-context:'||p_thread;
 if c is null or c->>'owner_id' is distinct from p_user::text or c->>'thread_id' is distinct from p_thread::text
 or (c#>>'{binding,account_version}')::bigint is distinct from coalesce((a->>'version')::bigint,0)
 or (c#>>'{binding,thread_revision}')::bigint is distinct from coalesce(r,0)
 or (c#>>'{binding,epoch}')::bigint is distinct from coalesce((a->>'epoch')::bigint,0)
 then return jsonb_build_object('error','journey_context_unavailable');end if;
 return jsonb_build_object('context',c,'paused',coalesce((a->>'paused')::boolean,false));
end $$;$up_4eab39b303e69e4cb7a7f6ce$;
-- supabase/sql/proposals/career_interview_entry_v1.sql statement 2
EXECUTE $up_8c592253f1096a22ab570fa8$

create function public.career_journey_turn_commit_v1(p_base jsonb,p_context jsonb,p_actions jsonb,p_artifact jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare u uuid:=(p_base->>'p_user')::uuid;t uuid:=(p_base->>'p_thread')::uuid;readback jsonb;c jsonb;saved jsonb;act jsonb;old jsonb;action_key text;artid uuid;verified jsonb;opened jsonb;existing_artifact jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 -- Replay lookup precedes current-context validation and performs no write.
 select value into old from career_watch_kv where user_id=u and key='career:turn:'||t||':'||(p_base->>'p_key');
 if old is not null then
  saved:=career_host_load(u,t,p_base->>'p_key',p_base->>'p_hash');
  if saved ? 'error' then return saved;end if;
  return jsonb_build_object('response',saved->'replay','replay',true);
 end if;
 readback:=career_journey_context_read_v1(u,t);if readback ? 'error' then return readback;end if;c:=readback->'context';
 if (p_context-'binding'-'captured_at') is distinct from (c-'binding'-'captured_at')
 or (p_context#>>'{binding,account_version}')::bigint is distinct from (p_base->>'p_account_version')::bigint+1
 or (p_context#>>'{binding,thread_revision}')::bigint is distinct from (p_base->>'p_revision')::bigint+1
 or p_context#>>'{binding,epoch}' is distinct from c#>>'{binding,epoch}'
 or p_context#>>'{binding,context_sha256}' !~ '^[a-f0-9]{64}$'
 or jsonb_typeof(p_actions) is distinct from 'array' or jsonb_array_length(p_actions)>8
 then raise exception 'invalid journey commit';end if;
 for act in select value from jsonb_array_elements(p_actions) loop
  if act#>>'{proposal,owner_id}' is distinct from u::text or act#>>'{proposal,thread_id}' is distinct from t::text
  or act#>>'{proposal,action_id}' !~ '^ij-[a-f0-9]{24}$'
  or encode(sha256(convert_to(act->>'canonical_args','UTF8')),'hex') is distinct from act#>>'{proposal,input_digest}'
  or (act->>'canonical_args')::jsonb is distinct from act#>'{proposal,args}' then raise exception 'invalid durable proposal';end if;
  action_key:='career:journey-action:'||t||':'||(act#>>'{proposal,action_id}');
  select value into old from career_watch_kv where user_id=u and career_watch_kv.key=action_key;
  if old is not null and old is distinct from act then raise exception 'durable proposal conflict';end if;
 end loop;
 if p_artifact is not null and p_artifact<>'null'::jsonb then
  artid:=(p_artifact->>'id')::uuid;
  if p_artifact->>'owner_id' is distinct from u::text or p_artifact->>'thread_id' is distinct from t::text
  or p_artifact->'binding' is distinct from p_context->'binding'
  or p_artifact->>'mime_type' is distinct from 'text/markdown; charset=utf-8'
  or p_artifact->>'encoding' is distinct from 'utf-8'
  or octet_length(p_artifact->>'content') not between 1 and 262144
  or (p_artifact->>'byte_length')::integer is distinct from octet_length(p_artifact->>'content')
  or p_artifact->>'sha256' is distinct from encode(sha256(convert_to(p_artifact->>'content','UTF8')),'hex')
  or p_artifact->>'action_id' is distinct from p_base#>>'{p_snapshot,stores,interviewJourney,checkpoint,pending_artifact,action_id}'
  or p_artifact->>'sha256' is distinct from p_base#>>'{p_snapshot,stores,interviewJourney,checkpoint,pending_artifact,sha256}'
  then raise exception 'invalid artifact';end if;
 end if;
 saved:=career_host_commit(u,t,p_base->>'p_key',p_base->>'p_hash',(p_base->>'p_revision')::bigint,(p_base->>'p_account_version')::bigint,p_base->'p_snapshot',p_base->'p_patch',p_base->>'p_input',p_base->'p_response');
 if saved ? 'error' then return saved;end if;
 insert into career_watch_kv(user_id,key,value)values(u,'career:journey-context:'||t,p_context)on conflict(user_id,key)do update set value=excluded.value,updated_at=now();
 for act in select value from jsonb_array_elements(p_actions) loop
  insert into career_watch_kv(user_id,key,value)values(u,'career:journey-action:'||t||':'||(act#>>'{proposal,action_id}'),act)on conflict(user_id,key)do nothing;
 end loop;
 if artid is not null then insert into career_watch_kv(user_id,key,value)values(u,'career:journey-artifact:'||artid,p_artifact);end if;
 -- Acknowledgement advances the turn/context binding without changing bytes.
 -- Retain a distinct current delivery binding for verified, still-current packs.
 verified:=p_base#>'{p_snapshot,stores,interviewJourney,completion,artifact}';
 if verified->>'readback_status'='verified' then
  select value into existing_artifact from career_watch_kv where user_id=u and key='career:journey-artifact:'||(verified->>'id') for update;
  select value into opened from career_watch_kv where user_id=u and key='career:journey-readback:'||(verified->>'receipt_id');
  if existing_artifact is null or opened is null or opened#>>'{receipt,type}' is distinct from 'artifact_readback'
  or existing_artifact->>'thread_id' is distinct from t::text or existing_artifact->>'sha256' is distinct from verified->>'sha256'
  or existing_artifact->'version' is distinct from verified->'version' or opened#>'{artifact,binding}' is distinct from existing_artifact->'binding'
  or existing_artifact->'target_ref' is distinct from p_base#>'{p_snapshot,stores,interviewJourney,target_ref}'
  or existing_artifact->'resume_ref' is distinct from p_base#>'{p_snapshot,stores,interviewJourney,resume_ref}'
  or existing_artifact->'epoch' is distinct from p_context#>'{binding,epoch}' then raise exception 'invalid verified artifact';end if;
  update career_watch_kv set value=value||jsonb_build_object('readable_binding',p_context->'binding','readable_journey_revision',p_base#>'{p_snapshot,stores,interviewJourney,revision}','verified_receipt_id',verified->'receipt_id'),updated_at=now()
   where user_id=u and key='career:journey-artifact:'||(verified->>'id');
 end if;
 return saved;
end $$;$up_8c592253f1096a22ab570fa8$;
-- supabase/sql/proposals/career_interview_entry_v1.sql statement 3
EXECUTE $up_375d9ef8bbe7e74ac8deedae$

create function public.career_journey_artifact_open_v1(p_user uuid,p_artifact uuid)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare a jsonb;c jsonb;s jsonb;r jsonb;rid uuid:=gen_random_uuid();t uuid;pending boolean;verified boolean;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select value into a from career_watch_kv where user_id=p_user and key='career:journey-artifact:'||p_artifact;
 if a is null then return jsonb_build_object('error','artifact_unavailable');end if;t:=(a->>'thread_id')::uuid;
 c:=career_journey_context_read_v1(p_user,t);
 select state#>'{career,stores,interviewJourney}'into s from agent_flow_state where user_id=p_user and thread_id=t;
 pending:=coalesce(a->'delivery_binding',a->'binding')=c#>'{context,binding}' and a->>'journey_revision'=s->>'revision' and a->>'action_id'=s#>>'{checkpoint,pending_artifact,action_id}';
 verified:=a->'readable_binding'=c#>'{context,binding}' and a->>'readable_journey_revision'=s->>'revision'
  and s#>>'{completion,artifact,readback_status}'='verified' and s#>>'{completion,artifact,id}'=p_artifact::text
  and s#>'{completion,artifact,version}'=a->'version' and s#>>'{completion,artifact,sha256}'=a->>'sha256'
  and s#>>'{completion,artifact,receipt_id}'=a->>'verified_receipt_id';
 if c ? 'error' or c->'paused'='true'::jsonb or s->>'status' is distinct from 'active' or not coalesce(pending or verified,false)
 or a->>'owner_id' is distinct from p_user::text or a->>'journey_id' is distinct from s->>'journey_id'
 or a->'target_ref' is distinct from s->'target_ref' or a->'resume_ref' is distinct from s->'resume_ref'
 or a->>'sha256' is distinct from encode(sha256(convert_to(a->>'content','UTF8')),'hex')
 or (a->>'byte_length')::integer is distinct from octet_length(a->>'content')
 then return jsonb_build_object('error','artifact_unavailable');end if;
 r:=jsonb_build_object('id',rid,'type',case when pending then 'artifact_readback' else 'artifact_reopen' end,'owner_id',p_user,'thread_id',t,'epoch',a->'epoch','artifact_id',p_artifact,'artifact_version',a->'version','action_id',a->'action_id','input_digest',a->'input_digest','authorized_open',true,'fresh_session',true,'journey_revision',a->'journey_revision','validated_binding',(c#>'{context,binding}')||jsonb_build_object('owner_id',p_user,'thread_id',t,'journey_revision',a->'journey_revision'),'target_ref',a->'target_ref','resume_ref',a->'resume_ref','sha256',a->'sha256');
 insert into career_watch_kv(user_id,key,value)values(p_user,'career:journey-readback:'||rid,jsonb_build_object('receipt',r,'artifact',a));
 return jsonb_build_object('artifact',a,'receipt',r);
end $$;$up_375d9ef8bbe7e74ac8deedae$;
-- supabase/sql/proposals/career_interview_entry_v1.sql statement 4
EXECUTE $up_bb7695d63a23ccf54f56d108$

create function public.career_journey_readback_v1(p_user uuid,p_thread uuid,p_receipt uuid)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare r jsonb;c jsonb;a jsonb;s jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 c:=career_journey_context_read_v1(p_user,p_thread);if c ? 'error' then return c;end if;
 select value into r from career_watch_kv where user_id=p_user and key='career:journey-readback:'||p_receipt;
 select value into a from career_watch_kv where user_id=p_user and key='career:journey-artifact:'||(r#>>'{receipt,artifact_id}');
 select state#>'{career,stores,interviewJourney}'into s from agent_flow_state where user_id=p_user and thread_id=p_thread;
 if r is null or a is null or r#>>'{receipt,type}' is distinct from 'artifact_readback' or r#>>'{receipt,thread_id}' is distinct from p_thread::text
 or r#>'{artifact,binding}' is distinct from a->'binding' or coalesce(a->'delivery_binding',a->'binding')is distinct from c#>'{context,binding}'
 or a->>'sha256' is distinct from r#>>'{receipt,sha256}' or a->>'action_id' is distinct from s#>>'{checkpoint,pending_artifact,action_id}'then return jsonb_build_object('error','artifact_unavailable');end if;
 -- Revalidate identical previously opened bytes against the current owned
 -- counter-only delivery binding; keep the original immutable open proof.
 return jsonb_build_object('artifact',a,'receipt',(r->'receipt')||jsonb_build_object('original_validated_binding',r#>'{receipt,validated_binding}','validated_binding',(r#>'{receipt,validated_binding}')||(c#>'{context,binding}')));
end $$;$up_bb7695d63a23ccf54f56d108$;
-- supabase/sql/proposals/career_interview_entry_v1.sql statement 5
EXECUTE $up_6cec05df76e7fa77beecd22b$
revoke all on function public.career_journey_context_read_v1(uuid,uuid),public.career_journey_turn_commit_v1(jsonb,jsonb,jsonb,jsonb),public.career_journey_artifact_open_v1(uuid,uuid),public.career_journey_readback_v1(uuid,uuid,uuid)from public,anon,authenticated;$up_6cec05df76e7fa77beecd22b$;
-- supabase/sql/proposals/career_interview_entry_v1.sql statement 6
EXECUTE $up_89d09bf74595944690439361$
grant execute on function public.career_journey_context_read_v1(uuid,uuid),public.career_journey_turn_commit_v1(jsonb,jsonb,jsonb,jsonb),public.career_journey_artifact_open_v1(uuid,uuid),public.career_journey_readback_v1(uuid,uuid,uuid)to service_role;$up_89d09bf74595944690439361$;
-- supabase/sql/proposals/career_interview_context_write_v1.sql statement 1
EXECUTE $up_2189e61dc3d40cec8b082e67$-- Owner-review proposal only. No seeds or production application.
create function public.career_journey_context_load_v2(p_user uuid,p_thread uuid)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare c jsonb;r jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 if not exists(select 1 from agent_threads where id=p_thread and user_id=p_user)then return jsonb_build_object('error','owned_thread_missing');end if;
 select value into c from career_watch_kv where user_id=p_user and key='career:journey-context:'||p_thread;
 if c is null then return jsonb_build_object('context',null);end if;
 r:=career_journey_context_read_v1(p_user,p_thread);return r;
end $$;$up_2189e61dc3d40cec8b082e67$;
-- supabase/sql/proposals/career_interview_context_write_v1.sql statement 2
EXECUTE $up_27aa5411420194bd685156b4$
create function public.career_journey_context_commit_v1(p_base jsonb,p_expected_context_sha text,p_context jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare u uuid:=(p_base->>'p_user')::uuid;t uuid:=(p_base->>'p_thread')::uuid;old jsonb;a jsonb;saved jsonb;source jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 select value into old from career_watch_kv where user_id=u and key='career:turn:'||t||':'||(p_base->>'p_key');
 if old is not null then
  saved:=career_host_load(u,t,p_base->>'p_key',p_base->>'p_hash');if saved ? 'error' then return saved;end if;
  return jsonb_build_object('response',saved->'replay','replay',true);
 end if;
 select value into a from career_watch_kv where user_id=u and key='career:account';
 select value into old from career_watch_kv where user_id=u and key='career:journey-context:'||t;
 if old#>>'{binding,context_sha256}' is distinct from p_expected_context_sha then return jsonb_build_object('error','journey_context_unavailable');end if;
 if p_context->>'owner_id' is distinct from u::text or p_context->>'thread_id' is distinct from t::text
 or p_context->>'contract_version' is distinct from 'career_journey_context/v1' or octet_length(p_context::text)>524288
 or (p_context#>>'{binding,account_version}')::bigint is distinct from (p_base->>'p_account_version')::bigint+1
 or (p_context#>>'{binding,thread_revision}')::bigint is distinct from (p_base->>'p_revision')::bigint+1
 or (p_context#>>'{binding,epoch}')::bigint is distinct from coalesce((a->>'epoch')::bigint,0)
 or exists(select 1 from jsonb_array_elements((p_context->'facts')||(p_context->'sources')) x where x#>>'{scope,owner_id}' is distinct from u::text or(x#>>'{scope,kind}'='thread'and x#>>'{scope,thread_id}' is distinct from t::text))
 then raise exception 'invalid owned context write';end if;
 for source in select value from jsonb_array_elements(p_context->'sources') loop
  if source->>'availability'='available' and source->>'source_sha256' is distinct from encode(sha256(convert_to(source->>'content','UTF8')),'hex')then raise exception 'invalid source bytes';end if;
 end loop;
 saved:=career_host_commit(u,t,p_base->>'p_key',p_base->>'p_hash',(p_base->>'p_revision')::bigint,(p_base->>'p_account_version')::bigint,p_base->'p_snapshot',p_base->'p_patch',p_base->>'p_input',p_base->'p_response');
 if saved ? 'error' then return saved;end if;
 insert into career_watch_kv(user_id,key,value)values(u,'career:journey-context:'||t,p_context)on conflict(user_id,key)do update set value=excluded.value,updated_at=now();
 return saved;
end $$;$up_27aa5411420194bd685156b4$;
-- supabase/sql/proposals/career_interview_context_write_v1.sql statement 3
EXECUTE $up_ae6cee0e17a1f2be2d64408b$
revoke all on function public.career_journey_context_load_v2(uuid,uuid),public.career_journey_context_commit_v1(jsonb,text,jsonb)from public,anon,authenticated;$up_ae6cee0e17a1f2be2d64408b$;
-- supabase/sql/proposals/career_interview_context_write_v1.sql statement 4
EXECUTE $up_1facdb06be7190b6ea78824c$
grant execute on function public.career_journey_context_load_v2(uuid,uuid),public.career_journey_context_commit_v1(jsonb,text,jsonb)to service_role;$up_1facdb06be7190b6ea78824c$;
-- supabase/sql/proposals/career_interview_execution_v1.sql statement 1
EXECUTE $up_3eebad1f804601000515e615$-- Owner-review proposal. Reuses owned KV and paired accounting; no seeds.
create function public.career_journey_action_read_v1(p_user uuid,p_thread uuid,p_action text)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare a jsonb;e jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 if not exists(select 1 from agent_threads where id=p_thread and user_id=p_user)then return jsonb_build_object('error','owned_thread_missing');end if;
 select value into a from career_watch_kv where user_id=p_user and key='career:journey-action:'||p_thread||':'||p_action;
 if a is null or a#>>'{proposal,owner_id}' is distinct from p_user::text or a#>>'{proposal,thread_id}' is distinct from p_thread::text or a#>>'{proposal,type}' is distinct from 'coach_answer' then return jsonb_build_object('error','action_unavailable');end if;
 select value into e from career_watch_kv where user_id=p_user and key='career:journey-execution:'||p_thread||':'||p_action;
 return jsonb_build_object('action',a,'execution',e);
end $$;$up_3eebad1f804601000515e615$;
-- supabase/sql/proposals/career_interview_execution_v1.sql statement 2
EXECUTE $up_935f25185d3604da52e251ae$

create function public.career_journey_action_claim_v1(p_user uuid,p_thread uuid,p_action text,p_spec jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare readback jsonb;a jsonb;e jsonb;s jsonb;c jsonb;p jsonb;pol career_model_pair_policy_v2;reason text;eid uuid:=gen_random_uuid();
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 readback:=career_journey_action_read_v1(p_user,p_thread,p_action);if readback ? 'error' then return readback;end if;
 if readback->'execution'<>'null'::jsonb then return jsonb_build_object('execution',readback->'execution','is_new',false);end if;a:=readback->'action';
 c:=career_journey_context_read_v1(p_user,p_thread);if c ? 'error' then return c;end if;
 select state#>'{career,stores,interviewJourney}'into s from agent_flow_state where user_id=p_user and thread_id=p_thread;
 if p_spec->>'request_hash' is distinct from a#>>'{proposal,input_digest}'
 or (p_spec->>'canonical_request')::jsonb is distinct from a#>'{proposal,args,request}'
 or p_spec->>'request_digest' is distinct from encode(sha256(convert_to(p_spec->>'canonical_request','UTF8')),'hex')
 or p_spec->>'generation_payload' is distinct from encode(sha256(convert_to(p_spec->>'generation_wire_body','UTF8')),'hex')
 or (p_spec->>'generation_input')::bigint is distinct from octet_length(p_spec->>'generation_wire_body')
 or p_spec->>'verification_envelope' is distinct from encode(sha256(convert_to(p_spec->>'verification_envelope_text','UTF8')),'hex')
 or octet_length(p_spec::text)>200000 then raise exception 'invalid exact execution specification';end if;
 if c->'paused'='true'::jsonb or s->>'status' is distinct from 'active' or s#>>'{checkpoint,pending_reasoning,action_id}' is distinct from p_action
 or a#>'{proposal,expected_binding,epoch}' is distinct from c#>'{context,binding,epoch}' then reason:='context_changed';end if;
 select * into pol from career_model_pair_policy_v2 where policy_digest=p_spec->>'policy_digest' and active;
 if pol.policy_digest is null or pol.generation_config_digest is distinct from p_spec->>'generation_config_digest'
 or pol.verification_config_digest is distinct from p_spec->>'verification_config_digest'
 or pol.model is distinct from ((p_spec->>'generation_wire_body')::jsonb->>'model')
 or (p_spec->>'generation_output')::bigint is distinct from (((p_spec->>'generation_wire_body')::jsonb->>'max_completion_tokens')::bigint)then reason:='policy_unavailable';end if;
 if reason is null then
  p:=career_model_pair_reserve_v2(p_user,p_thread,p_action,p_spec->>'request_hash',(c#>>'{context,binding,thread_revision}')::bigint,(c#>>'{context,binding,account_version}')::bigint,(c#>>'{context,binding,epoch}')::bigint,p_spec->>'policy_digest',p_spec->>'generation_payload',p_spec->>'verification_envelope',(p_spec->>'generation_input')::bigint,(p_spec->>'generation_output')::bigint,(p_spec->>'verification_input')::bigint,(p_spec->>'verification_output')::bigint);
  if p->>'ok' is distinct from 'true' then reason:=p->>'reason';end if;
 end if;
 e:=jsonb_build_object('execution_id',eid,'owner_id',p_user,'thread_id',p_thread,'action_id',p_action,'epoch',c#>'{context,binding,epoch}','state',case when reason is null then 'claimed' else 'not_sent' end,'reason',reason,'pair_id',case when reason is null then p->'pair_id' else 'null'::jsonb end,'spec',p_spec,'observations','{}'::jsonb,'claimed_at',clock_timestamp());
 insert into career_watch_kv(user_id,key,value)values(p_user,'career:journey-execution:'||p_thread||':'||p_action,e);
 return jsonb_build_object('execution',e,'is_new',true);
end $$;$up_935f25185d3604da52e251ae$;
-- supabase/sql/proposals/career_interview_execution_v1.sql statement 3
EXECUTE $up_76b694eaa0fc1f79aca46ad7$

create function public.career_journey_leg_consume_v1(p_user uuid,p_thread uuid,p_action text,p_execution uuid,p_kind text,p_payload text,p_envelope text,p_input bigint,p_output bigint)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare e jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select value into e from career_watch_kv where user_id=p_user and key='career:journey-execution:'||p_thread||':'||p_action;
 if e is null or e->>'execution_id' is distinct from p_execution::text or e->>'state' is distinct from 'claimed' then return jsonb_build_object('ok',false,'reason','execution_fenced');end if;
 if p_kind='verification'and(p_payload is distinct from encode(sha256(convert_to(e->>'verification_wire_body','UTF8')),'hex')or p_input is distinct from octet_length(e->>'verification_wire_body'))then return jsonb_build_object('ok',false,'reason','checker_payload_not_durable');end if;
 return career_model_leg_consume_v2(p_user,(e->>'pair_id')::uuid,p_kind,p_payload,p_envelope,p_input,p_output);
end $$;$up_76b694eaa0fc1f79aca46ad7$;
-- supabase/sql/proposals/career_interview_execution_v1.sql statement 4
EXECUTE $up_bd63e5c9248ca4cc9d1c30d7$
create function public.career_journey_checker_prepare_v1(p_user uuid,p_thread uuid,p_action text,p_execution uuid,p_wire text)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare e jsonb;a jsonb;wire jsonb;input jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select value into e from career_watch_kv where user_id=p_user and key='career:journey-execution:'||p_thread||':'||p_action for update;
 select value into a from career_watch_kv where user_id=p_user and key='career:journey-action:'||p_thread||':'||p_action;
 wire:=p_wire::jsonb;input:=(wire#>>'{messages,-1,content}')::jsonb;
 if e is null or e->>'execution_id' is distinct from p_execution::text or e->>'state' is distinct from 'claimed'
 or octet_length(p_wire)>(e#>>'{spec,verification_input}')::bigint
 or wire->>'model' is distinct from ((e#>>'{spec,generation_wire_body}')::jsonb->>'model')
 or (wire->>'max_completion_tokens')::bigint is distinct from (e#>>'{spec,verification_output}')::bigint
 or input->>'kind' is distinct from 'interview_checker_request/v1' or input->'request' is distinct from a#>'{proposal,args,request}'
 or input->'candidate' is distinct from (e#>>'{observations,generation,text}')::jsonb
 or input->>'request_digest' is distinct from e#>>'{spec,request_digest}'
 or(e->>'verification_wire_body' is not null and e->>'verification_wire_body' is distinct from p_wire)then raise exception 'invalid immutable checker request';end if;
 e:=e||jsonb_build_object('verification_wire_body',p_wire);
 update career_watch_kv set value=e,updated_at=now()where user_id=p_user and key='career:journey-execution:'||p_thread||':'||p_action;
 return jsonb_build_object('ok',true);
end $$;$up_bd63e5c9248ca4cc9d1c30d7$;
-- supabase/sql/proposals/career_interview_execution_v1.sql statement 5
EXECUTE $up_c679cfbb021a390815cb1483$

create function public.career_journey_observe_v1(p_user uuid,p_thread uuid,p_action text,p_execution uuid,p_kind text,p_receipt jsonb,p_text text)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare e jsonb;old jsonb;leg career_model_pair_legs_v2;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select value into e from career_watch_kv where user_id=p_user and key='career:journey-execution:'||p_thread||':'||p_action for update;
 select * into leg from career_model_pair_legs_v2 where pair_id=(e->>'pair_id')::uuid and user_id=p_user and thread_id=p_thread and kind=p_kind;
 if e is null or e->>'execution_id' is distinct from p_execution::text or leg.dispatched_payload is null or p_kind not in('generation','verification')
 or p_receipt->>'request_body_sha256' is distinct from leg.dispatched_payload or p_receipt->>'config_digest' is distinct from leg.config_digest
 or octet_length(coalesce(p_text,''))>40000 then raise exception 'invalid owned provider observation';end if;
 old:=e#>array['observations',p_kind];
 if old is not null and old->'receipt' is distinct from p_receipt then raise exception 'provider observation conflict';end if;
 if p_text is not null and old->>'text' is not null and old->>'text' is distinct from p_text then raise exception 'provider content conflict';end if;
 e:=jsonb_set(e,array['observations',p_kind],jsonb_build_object('receipt',p_receipt,'text',coalesce(p_text,old->>'text')));
 update career_watch_kv set value=e,updated_at=now()where user_id=p_user and key='career:journey-execution:'||p_thread||':'||p_action;
 return jsonb_build_object('ok',true);
end $$;$up_c679cfbb021a390815cb1483$;
-- supabase/sql/proposals/career_interview_execution_v1.sql statement 6
EXECUTE $up_d97009e3a67a349d8467f66c$
create function public.career_journey_execution_fence_v1(p_user uuid,p_thread uuid,p_action text,p_execution uuid)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare e jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select value into e from career_watch_kv where user_id=p_user and key='career:journey-execution:'||p_thread||':'||p_action for update;
 if e is null or e->>'execution_id' is distinct from p_execution::text then raise exception 'execution unavailable';end if;
 if e->>'state'='claimed'then
  e:=e||jsonb_build_object('state','unknown');
  update career_watch_kv set value=e,updated_at=now()where user_id=p_user and key='career:journey-execution:'||p_thread||':'||p_action;
  update career_model_reservations_v1 set expires_at=least(expires_at,clock_timestamp())where user_id=p_user and state='started'and id in(select ticket_id from career_model_pair_legs_v2 where pair_id=(e->>'pair_id')::uuid and user_id=p_user);
 end if;
 return jsonb_build_object('execution',e);
end $$;$up_d97009e3a67a349d8467f66c$;
-- supabase/sql/proposals/career_interview_execution_v1.sql statement 7
EXECUTE $up_7063323f834b1fa18608785b$

create function public.career_journey_outcome_record_v1(p_user uuid,p_thread uuid,p_action text,p_execution uuid,p_result jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare e jsonb;p jsonb;s jsonb;old jsonb;checker jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select value into e from career_watch_kv where user_id=p_user and key='career:journey-execution:'||p_thread||':'||p_action for update;
 if e is null or e->>'execution_id' is distinct from p_execution::text or p_result->>'kind'not in('semantic_candidate','reasoning_outcome')or octet_length(p_result::text)>100000 then raise exception 'invalid owned outcome';end if;
 if e->>'pair_id' is not null then p:=career_model_pair_read_v2(p_user,(e->>'pair_id')::uuid);else p:=jsonb_build_object('accounting_state','settled','known_cost_micros',0);end if;
 if p_result->>'budget_state'='settled' and p->>'accounting_state' is distinct from 'settled' then raise exception 'unsettled accounting';end if;
 if p_result->>'kind'='semantic_candidate' then
  checker:=(e#>>'{observations,verification,text}')::jsonb;
  select state#>'{career,stores,interviewJourney}'into s from agent_flow_state where user_id=p_user and thread_id=p_thread;
  if p#>>'{generation,state}' is distinct from 'recorded'or p#>>'{verification,state}' is distinct from 'recorded'or p->>'provider_calls_confirmed' is distinct from '2'
  or p->>'contextCurrent' is distinct from 'true' or s->>'status' is distinct from 'active' or s#>>'{checkpoint,pending_reasoning,action_id}' is distinct from p_action
  or (p_result->>'canonical_candidate')::jsonb is distinct from p_result->'candidate'
  or p_result->>'candidate_sha256' is distinct from encode(sha256(convert_to(p_result->>'canonical_candidate','UTF8')),'hex')
  or p_result->>'rendered_sha256' is distinct from encode(sha256(convert_to(p_result->>'rendered_response','UTF8')),'hex')then raise exception 'untrusted candidate publication';end if;
  if p_result->'candidate' is distinct from (e#>>'{observations,generation,text}')::jsonb
  or checker->>'version' is distinct from 'career_interview_checker/v1'or checker->>'verdict' is distinct from 'accepted'
  or checker->>'request_digest' is distinct from e#>>'{spec,request_digest}'
  or checker->>'candidate_sha256' is distinct from p_result->>'candidate_sha256'
  or checker->>'rendered_sha256' is distinct from p_result->>'rendered_sha256'
  or not coalesce(checker#>'{checks,answer_meaning}'='true'::jsonb and checker#>'{checks,factual_grounding}'='true'::jsonb and checker#>'{checks,role_constraints}'='true'::jsonb and checker#>'{checks,rubric_grounding}'='true'::jsonb and checker#>'{checks,truthfulness}'='true'::jsonb,false)then raise exception 'independent checker proof missing';end if;
 end if;
 old:=e->'result';
 if old=p_result then return jsonb_build_object('execution',e);end if;
 if old is not null and old->>'budget_state'='settled'and not(old->>'kind'='semantic_candidate'and p_result->>'kind'='reasoning_outcome'and p_result->>'failure_kind'='stale_context'and p->>'contextCurrent'='false')then raise exception 'terminal outcome conflict';end if;
 if p_result->>'budget_state'='uncertain'then
  -- Reported transport uncertainty participates immediately in the shared
  -- existing overdue-started stop, while retaining full holds. A later owned
  -- raw receipt may perform the first settlement; no dispatch is repeated.
  update career_model_reservations_v1 set expires_at=least(expires_at,clock_timestamp())where user_id=p_user and state='started'and id in(select ticket_id from career_model_pair_legs_v2 where pair_id=(e->>'pair_id')::uuid and user_id=p_user);
 end if;
 e:=e||jsonb_build_object('state',case when p_result->>'budget_state'='settled'then 'closed'else 'unknown'end,'result',p_result,'result_receipt_id',gen_random_uuid());
 update career_watch_kv set value=e,updated_at=now()where user_id=p_user and key='career:journey-execution:'||p_thread||':'||p_action;
 return jsonb_build_object('execution',e);
end $$;$up_7063323f834b1fa18608785b$;
-- supabase/sql/proposals/career_interview_execution_v1.sql statement 8
EXECUTE $up_52ae736b7f707e1950853698$
revoke all on function public.career_journey_action_read_v1(uuid,uuid,text),public.career_journey_action_claim_v1(uuid,uuid,text,jsonb),public.career_journey_leg_consume_v1(uuid,uuid,text,uuid,text,text,text,bigint,bigint),public.career_journey_observe_v1(uuid,uuid,text,uuid,text,jsonb,text),public.career_journey_outcome_record_v1(uuid,uuid,text,uuid,jsonb),public.career_journey_execution_fence_v1(uuid,uuid,text,uuid)from public,anon,authenticated;$up_52ae736b7f707e1950853698$;
-- supabase/sql/proposals/career_interview_execution_v1.sql statement 9
EXECUTE $up_9c4847e22fd65cd8ce7ee407$
grant execute on function public.career_journey_action_read_v1(uuid,uuid,text),public.career_journey_action_claim_v1(uuid,uuid,text,jsonb),public.career_journey_leg_consume_v1(uuid,uuid,text,uuid,text,text,text,bigint,bigint),public.career_journey_observe_v1(uuid,uuid,text,uuid,text,jsonb,text),public.career_journey_outcome_record_v1(uuid,uuid,text,uuid,jsonb),public.career_journey_execution_fence_v1(uuid,uuid,text,uuid)to service_role;$up_9c4847e22fd65cd8ce7ee407$;
-- supabase/sql/proposals/career_interview_execution_v1.sql statement 10
EXECUTE $up_a82fd84286ce0e6a0e7c2cd1$
revoke all on function public.career_journey_checker_prepare_v1(uuid,uuid,text,uuid,text)from public,anon,authenticated;$up_a82fd84286ce0e6a0e7c2cd1$;
-- supabase/sql/proposals/career_interview_execution_v1.sql statement 11
EXECUTE $up_af66f434caff038a755b26e1$
grant execute on function public.career_journey_checker_prepare_v1(uuid,uuid,text,uuid,text)to service_role;$up_af66f434caff038a755b26e1$;
-- supabase/sql/proposals/career_interview_context_refresh_v1.sql statement 1
EXECUTE $up_1d929c5a676687e1cfc91a57$-- Owner-review proposal only. Keep the strict context equality RPC unchanged.
-- Counter-only refresh requires an owned source-basis witness and CAS.
-- Replace only the existing watch RPC in this unapplied proposal. Its original
-- validation, owner lock, CAS and pause/epoch fences remain. A typed value-free
-- witness commits with the watch value and counter; it is never a chat receipt.
create or replace function public.career_watch_write(p_user uuid,p_key text,p_value jsonb,p_version bigint,p_epoch bigint) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare a jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select value into a from career_watch_kv where user_id=p_user and key='career:account';a:=coalesce(a,'{"version":0,"epoch":0}'::jsonb);
 if (a->>'version')::bigint is distinct from p_version or (a->>'epoch')::bigint is distinct from p_epoch or a->'paused'='true'::jsonb then raise exception 'stale or paused career worker';end if;
 if p_user is null or p_key is null or not (p_key in ('career:watch-profile:'||p_user,'career:reminder-queue:'||p_user,'career:reminder-history:'||p_user) or (p_key like 'career:jobs:snapshot:board:%' and right(p_key,37)=':'||p_user)) or p_value is null or octet_length(p_value::text)>1048576 then raise exception 'invalid watch state';end if;
 if p_key='career:watch-profile:'||p_user and p_value->>'user_id' is distinct from p_user::text then raise exception 'watch owner mismatch';end if;
 insert into career_watch_kv(user_id,key,value) values(p_user,p_key,p_value) on conflict(user_id,key) do update set value=excluded.value,updated_at=now();
 a:=a||jsonb_build_object('version',p_version+1);
 insert into career_watch_kv(user_id,key,value) values(p_user,'career:account',a) on conflict(user_id,key) do update set value=excluded.value,updated_at=now();
 insert into career_watch_kv(user_id,key,value)values(p_user,'career:owner-mutation:'||p_epoch||':'||(p_version+1),jsonb_build_object('kind','career_watch_write/v1','owner_id',p_user,'epoch',p_epoch,'account_version',p_version+1,'key_sha256',encode(sha256(convert_to(p_key,'UTF8')),'hex')));
 return jsonb_build_object('version',p_version+1,'epoch',p_epoch);
end $$;$up_1d929c5a676687e1cfc91a57$;
-- supabase/sql/proposals/career_interview_context_refresh_v1.sql statement 2
EXECUTE $up_d4486f31ffec79033b3f1794$
revoke all on function public.career_watch_write(uuid,text,jsonb,bigint,bigint)from public,anon,authenticated;$up_d4486f31ffec79033b3f1794$;
-- supabase/sql/proposals/career_interview_context_refresh_v1.sql statement 3
EXECUTE $up_47002d5f2f79ac16feaa6b30$
grant execute on function public.career_watch_write(uuid,text,jsonb,bigint,bigint)to service_role;$up_47002d5f2f79ac16feaa6b30$;
-- supabase/sql/proposals/career_interview_context_refresh_v1.sql statement 4
EXECUTE $up_f42a511bd40a6362c26b7e5f$
create function public.career_journey_context_basis_v1(p_user uuid,p_thread uuid)
returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 with stores as(select thread_id,coalesce(state#>'{career,stores}','{}'::jsonb)-'interviewJourney'-'globalPause' as value from agent_flow_state where user_id=p_user),
 account_items as(select k.key,v.item-'freshness' as item from career_watch_kv k cross join lateral jsonb_array_elements(
  coalesce(k.value->'facts','[]'::jsonb)||coalesce(k.value->'sources','[]'::jsonb)||coalesce(k.value->'dialogue','[]'::jsonb)||coalesce(k.value->'goals','[]'::jsonb)||coalesce(k.value->'pending_asks','[]'::jsonb)||coalesce(k.value->'tool_status','[]'::jsonb)||coalesce(k.value->'receipts','[]'::jsonb)||coalesce(k.value->'artifacts','[]'::jsonb)||coalesce(k.value->'assessments','[]'::jsonb)||case when jsonb_typeof(k.value->'current_draft')='object'then jsonb_build_array(k.value->'current_draft')else '[]'::jsonb end)v(item)
  where k.user_id=p_user and k.key~'^career:journey-context:[a-f0-9-]{36}$'and v.item#>>'{scope,kind}'='account'),
 mutation_counts as(select count(*)filter(where key like 'career:turn:%')as turns,
  count(*)filter(where key='career:owner-mutation:'||(value->>'epoch')||':'||(value->>'account_version')and value->>'kind'='career_watch_write/v1'and value->>'owner_id'=p_user::text and value->>'epoch'=coalesce((select value->>'epoch'from career_watch_kv where user_id=p_user and key='career:account'),'0')and jsonb_typeof(value->'account_version')='number'and value->>'account_version'~'^[0-9]{1,19}$'and value->>'key_sha256'~'^[a-f0-9]{64}$')as background
  from career_watch_kv where user_id=p_user)
 select jsonb_build_object(
  'turn_count',turns,'mutation_count',turns+background,
  'thread_sha',encode(sha256(convert_to(coalesce((select value from stores where thread_id=p_thread),'{}'::jsonb)::text,'UTF8')),'hex'),
  'account_sha',encode(sha256(convert_to(jsonb_build_object('stores',coalesce((select jsonb_agg(jsonb_build_array(thread_id,value)order by thread_id)from stores where value<>'{}'::jsonb),'[]'::jsonb),'canonical',coalesce((select jsonb_agg(jsonb_build_array(key,item)order by key,item->>'id')from account_items),'[]'::jsonb),'watch_profile',(select value from career_watch_kv where user_id=p_user and key='career:watch-profile:'||p_user),'preferences',coalesce((select value-'version'-'epoch'-'paused' from career_watch_kv where user_id=p_user and key='career:account'),'{}'::jsonb))::text,'UTF8')),'hex'))from mutation_counts;
$$;$up_f42a511bd40a6362c26b7e5f$;
-- supabase/sql/proposals/career_interview_context_refresh_v1.sql statement 5
EXECUTE $up_2747c4a622919cccd22a212c$
create function public.career_journey_context_cursor_v1()returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
declare t uuid;s jsonb;pending jsonb;b jsonb;
begin
 if NEW.key!~'^career:journey-context:[a-f0-9-]{36}$'then return NEW;end if;
 t:=substring(NEW.key from length('career:journey-context:')+1)::uuid;
 perform pg_advisory_xact_lock(hashtextextended(NEW.user_id::text,0));
 if NEW.value->>'owner_id' is distinct from NEW.user_id::text or NEW.value->>'thread_id' is distinct from t::text or not exists(select 1 from agent_threads where id=t and user_id=NEW.user_id)then raise exception 'invalid owned context cursor';end if;
 select state#>'{career,stores,interviewJourney}'into s from agent_flow_state where user_id=NEW.user_id and thread_id=t;
 select coalesce(jsonb_agg(i->'id'),'[]'::jsonb)into pending from jsonb_array_elements(coalesce(NEW.value->'invalidations','[]'::jsonb))i
  where i#>>'{provenance,record_id}'~'^authority:[a-f0-9]{64}$'and not exists(select 1 from jsonb_array_elements(coalesce(s->'invalidations','[]'::jsonb))applied where applied#>>'{provenance,record_id}'=i#>>'{provenance,record_id}')
  and(s is not null or exists(select 1 from jsonb_each(NEW.value)fields cross join lateral jsonb_array_elements(case when jsonb_typeof(fields.value)='array'then fields.value else '[]'::jsonb end)row where row->>'freshness'='stale'and(i->'target_ids')?(row->>'id'))or(NEW.value#>>'{current_draft,freshness}'='stale'and(i->'target_ids')?(NEW.value#>>'{current_draft,id}')));
 b:=career_journey_context_basis_v1(NEW.user_id,t)||jsonb_build_object('context_sha256',NEW.value#>'{binding,context_sha256}','pending_invalidation_ids',pending);
 -- An explicit owned import can still carry its older projection clock.
 -- Anchor its receipt watermark to that clock, rather than the import time.
 b:=b||jsonb_build_object('mutation_count',(b->>'mutation_count')::bigint-coalesce((select(value->>'version')::bigint from career_watch_kv where user_id=NEW.user_id and key='career:account'),0)+(NEW.value#>>'{binding,account_version}')::bigint);
 insert into career_watch_kv(user_id,key,value)values(NEW.user_id,'career:journey-context-cursor:'||t,b)on conflict(user_id,key)do update set value=excluded.value,updated_at=now();
 return NEW;
end $$;$up_2747c4a622919cccd22a212c$;
-- supabase/sql/proposals/career_interview_context_refresh_v1.sql statement 6
EXECUTE $up_d2b1f513dcce44730118e040$
create trigger career_journey_context_cursor_v1 after insert or update of value on public.career_watch_kv for each row execute function public.career_journey_context_cursor_v1();$up_d2b1f513dcce44730118e040$;
-- supabase/sql/proposals/career_interview_context_refresh_v1.sql statement 7
EXECUTE $up_69a82d5b03561b1e50e60272$

create function public.career_journey_context_refresh_load_v1(p_user uuid,p_thread uuid)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare c jsonb;a jsonb;r bigint;cursor_value jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 if not exists(select 1 from agent_threads where id=p_thread and user_id=p_user)then return jsonb_build_object('error','owned_thread_missing');end if;
 select value into a from career_watch_kv where user_id=p_user and key='career:account';
 select coalesce((state#>>'{career,revision}')::bigint,0)into r from agent_flow_state where user_id=p_user and thread_id=p_thread;
 select value into c from career_watch_kv where user_id=p_user and key='career:journey-context:'||p_thread;
 select value into cursor_value from career_watch_kv where user_id=p_user and key='career:journey-context-cursor:'||p_thread;
 return jsonb_build_object('context',c,'cursor',cursor_value,'basis',career_journey_context_basis_v1(p_user,p_thread),'binding',jsonb_build_object('epoch',coalesce((a->>'epoch')::bigint,0),'account_version',coalesce((a->>'version')::bigint,0),'thread_revision',coalesce(r,0)));
end $$;$up_69a82d5b03561b1e50e60272$;
-- supabase/sql/proposals/career_interview_context_refresh_v1.sql statement 8
EXECUTE $up_1da01e2e1cc7975e6c7e17ba$
create function public.career_journey_context_content_v1(p_context jsonb)
returns jsonb language plpgsql immutable security invoker set search_path=public,pg_temp as $$
declare c jsonb:=p_context-'binding'-'captured_at'-'invalidations';k text;rows jsonb;
begin
 foreach k in array array['facts','sources','dialogue','goals','pending_asks','tool_status','receipts','artifacts','assessments']loop
  select coalesce(jsonb_agg(value-'freshness'order by ordinality),'[]'::jsonb)into rows from jsonb_array_elements(c->k)with ordinality;
  c:=jsonb_set(c,array[k],rows);
 end loop;
 if jsonb_typeof(c->'current_draft')='object'then c:=jsonb_set(c,'{current_draft}',(c->'current_draft')-'freshness');end if;
 return c;
end $$;$up_1da01e2e1cc7975e6c7e17ba$;
-- supabase/sql/proposals/career_interview_context_refresh_v1.sql statement 9
EXECUTE $up_ccd6472ef6fbb952284b3aa5$
create function public.career_journey_context_refresh_commit_v1(p_user uuid,p_thread uuid,p_expected_hash text,p_binding jsonb,p_basis jsonb,p_context jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare loaded jsonb;old jsonb;cursor_value jsonb;s jsonb;art record;k text;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 loaded:=career_journey_context_refresh_load_v1(p_user,p_thread);if loaded ? 'error'then return loaded;end if;old:=loaded->'context';
 if old is null or old='null'::jsonb then return jsonb_build_object('error','journey_context_unavailable');end if;
 if old#>'{binding,epoch}' is distinct from loaded#>'{binding,epoch}'then return jsonb_build_object('error','privacy_epoch_changed');end if;
 if old#>>'{binding,context_sha256}' is distinct from p_expected_hash or loaded->'binding' is distinct from p_binding or loaded->'basis' is distinct from p_basis then return jsonb_build_object('error','revision_conflict');end if;
 -- A source fingerprint alone cannot authorize an unexplained counter edit.
 -- Each version must have either an atomic host receipt or typed watch witness.
 -- Unsupported writers or missing witnesses fail closed; do not infer a turn.
 cursor_value:=loaded->'cursor';
 if (old->'binding')-'context_sha256' is distinct from p_binding and(
  cursor_value->>'context_sha256' is distinct from p_expected_hash or coalesce(cursor_value->'mutation_count',cursor_value->'turn_count')is null
  or (p_binding->>'account_version')::bigint<(old#>>'{binding,account_version}')::bigint
  or (p_binding->>'account_version')::bigint-(old#>>'{binding,account_version}')::bigint is distinct from (p_basis->>'mutation_count')::bigint-coalesce(cursor_value->>'mutation_count',cursor_value->>'turn_count')::bigint
  or (p_binding->>'thread_revision')::bigint<(old#>>'{binding,thread_revision}')::bigint
  or (p_binding->>'thread_revision')::bigint-(old#>>'{binding,thread_revision}')::bigint>(p_binding->>'account_version')::bigint-(old#>>'{binding,account_version}')::bigint
 )then return jsonb_build_object('error','journey_context_unavailable');end if;
 if p_context->>'owner_id' is distinct from p_user::text or p_context->>'thread_id' is distinct from p_thread::text
 or (p_context->'binding')-'context_sha256' is distinct from p_binding or p_context#>>'{binding,context_sha256}'!~'^[a-f0-9]{64}$'
 or career_journey_context_content_v1(old) is distinct from career_journey_context_content_v1(p_context)
 or not((p_context->'invalidations')@>(old->'invalidations'))then raise exception 'invalid context-only refresh';end if;
 -- Refresh cannot revive an old/stale value or change any item version/stamp.
 foreach k in array array['facts','sources','dialogue','goals','pending_asks','tool_status','receipts','artifacts','assessments']loop
  if exists(select 1 from jsonb_array_elements(old->k)o join jsonb_array_elements(p_context->k)n on n->>'id'=o->>'id'where not(n->'freshness'=o->'freshness'or(o->>'freshness'='current'and n->>'freshness'='stale')))then raise exception 'freshness revival refused';end if;
 end loop;
 if jsonb_typeof(old->'current_draft')='object'and not(p_context#>'{current_draft,freshness}'=old#>'{current_draft,freshness}'or(old#>>'{current_draft,freshness}'='current'and p_context#>>'{current_draft,freshness}'='stale'))then raise exception 'draft revival refused';end if;
 insert into career_watch_kv(user_id,key,value)values(p_user,'career:journey-context:'||p_thread,p_context)on conflict(user_id,key)do update set value=excluded.value,updated_at=now();
 select value into cursor_value from career_watch_kv where user_id=p_user and key='career:journey-context-cursor:'||p_thread;
 if jsonb_array_length(cursor_value->'pending_invalidation_ids')=0 then
  select state#>'{career,stores,interviewJourney}'into s from agent_flow_state where user_id=p_user and thread_id=p_thread;
  for art in select key,value from career_watch_kv where user_id=p_user and key like 'career:journey-artifact:%'and value->>'thread_id'=p_thread::text loop
   if art.value->>'journey_id'=s->>'journey_id'and art.value->'epoch'=p_binding->'epoch'and art.value->'target_ref'=s->'target_ref'and art.value->'resume_ref'=s->'resume_ref'
   and(art.value->>'action_id'=s#>>'{checkpoint,pending_artifact,action_id}'or(art.value->>'id'=s#>>'{completion,artifact,id}'and art.value->>'sha256'=s#>>'{completion,artifact,sha256}'and s#>>'{completion,artifact,readback_status}'='verified'))then
    update career_watch_kv set value=value||jsonb_build_object('delivery_binding',p_context->'binding')||case when s#>>'{completion,artifact,id}'=art.value->>'id'then jsonb_build_object('readable_binding',p_context->'binding','readable_journey_revision',s->'revision')else '{}'::jsonb end,updated_at=now()where user_id=p_user and key=art.key;
   end if;
  end loop;
 end if;
 return jsonb_build_object('ok',true,'context',p_context,'pending_invalidation_ids',cursor_value->'pending_invalidation_ids');
end $$;$up_ccd6472ef6fbb952284b3aa5$;
-- supabase/sql/proposals/career_interview_context_refresh_v1.sql statement 10
EXECUTE $up_333c2de255e20ca25424de8a$
create function public.career_journey_artifact_scope_v1(p_user uuid,p_artifact uuid)
returns jsonb language sql security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('thread_id',(select a.value->'thread_id'from career_watch_kv a join agent_threads t on t.id=(a.value->>'thread_id')::uuid and t.user_id=p_user where a.user_id=p_user and a.key='career:journey-artifact:'||p_artifact));
$$;$up_333c2de255e20ca25424de8a$;
-- supabase/sql/proposals/career_interview_context_refresh_v1.sql statement 11
EXECUTE $up_6e446da3ca644cdf8286c972$
revoke all on function public.career_journey_context_basis_v1(uuid,uuid),public.career_journey_context_cursor_v1(),public.career_journey_context_refresh_load_v1(uuid,uuid),public.career_journey_context_content_v1(jsonb),public.career_journey_context_refresh_commit_v1(uuid,uuid,text,jsonb,jsonb,jsonb),public.career_journey_artifact_scope_v1(uuid,uuid)from public,anon,authenticated;$up_6e446da3ca644cdf8286c972$;
-- supabase/sql/proposals/career_interview_context_refresh_v1.sql statement 12
EXECUTE $up_26a9ccacc364475582c2df84$
grant execute on function public.career_journey_context_basis_v1(uuid,uuid),public.career_journey_context_cursor_v1(),public.career_journey_context_refresh_load_v1(uuid,uuid),public.career_journey_context_content_v1(jsonb),public.career_journey_context_refresh_commit_v1(uuid,uuid,text,jsonb,jsonb,jsonb),public.career_journey_artifact_scope_v1(uuid,uuid)to service_role;$up_26a9ccacc364475582c2df84$;
-- supabase/sql/proposals/career_native_execution_v1.sql statement 1
EXECUTE $up_c766473e4054ce3b1d3eeb1c$-- Owner-review only. No funds, credentials, policy seeds or deployment.
create function public.career_native_read_v1(p_user uuid,p_thread uuid,p_key text,p_hash text)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare e jsonb;c jsonb;a jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 if not exists(select 1 from agent_threads where id=p_thread and user_id=p_user)then return jsonb_build_object('error','owned_thread_missing');end if;
 select value into a from career_watch_kv where user_id=p_user and key='career:account';
 select value into e from career_watch_kv where user_id=p_user and key='career:native-execution:'||p_thread||':'||p_key;
 select value into c from career_watch_kv where user_id=p_user and key='career:native-context:'||p_thread;
 if e is not null and(e->>'request_hash' is distinct from p_hash or e->>'owner_id' is distinct from p_user::text or e->>'thread_id' is distinct from p_thread::text)then return jsonb_build_object('error','turn_key_conflict');end if;
 if e is not null and e->'epoch' is distinct from coalesce(a->'epoch','0'::jsonb)then return jsonb_build_object('error','privacy_epoch_changed');end if;
 return jsonb_build_object('execution',e,'context',c);
end $$;$up_c766473e4054ce3b1d3eeb1c$;
-- supabase/sql/proposals/career_native_execution_v1.sql statement 2
EXECUTE $up_5971fd5cd74eb6407aa6a223$

create function public.career_native_claim_v1(p_user uuid,p_thread uuid,p_key text,p_hash text,p_revision bigint,p_version bigint,p_epoch bigint,p_spec jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare r jsonb;e jsonb;q jsonb;c jsonb;wire jsonb;p jsonb;pol career_model_pair_policy_v2;reason text;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 r:=career_native_read_v1(p_user,p_thread,p_key,p_hash);if r?'error'then return r;end if;
 if r->'execution'<>'null'::jsonb then return jsonb_build_object('execution',r->'execution','is_new',false);end if;
 if not career_model_context_current_v1(p_user,p_thread,p_revision,p_version,p_epoch)then return jsonb_build_object('error','revision_conflict');end if;
 q:=(p_spec->>'canonical_request')::jsonb;c:=q->'context';wire:=(p_spec->>'generation_wire_body')::jsonb;
 if p_key!~'^[A-Za-z0-9_-]{1,128}$'or p_hash!~'^[a-f0-9]{64}$'or octet_length(p_spec::text)>2000000
 or q->>'version' is distinct from 'career_native_request/v1'or q->'intent' is distinct from p_spec->'intent'
 or q#>>'{intent,version}' is distinct from 'career_native_intent/v1'or q#>>'{intent,source}' is distinct from 'owned_deterministic_host'
 or q#>'{intent,expected_binding}' is distinct from jsonb_build_object('owner_id',p_user,'thread_id',p_thread,'account_version',p_version,'thread_revision',p_revision,'epoch',p_epoch)
 or q#>>'{intent,user_text_sha256}' is distinct from encode(sha256(convert_to(q#>>'{intent,user_text}','UTF8')),'hex')
 or p_spec->>'request_digest' is distinct from encode(sha256(convert_to(p_spec->>'canonical_request','UTF8')),'hex')
 or p_spec->>'intent_sha256' is distinct from encode(sha256(convert_to(p_spec->>'canonical_intent','UTF8')),'hex')or(p_spec->>'canonical_intent')::jsonb is distinct from q->'intent'
 or c->>'contract_version' is distinct from 'career_journey_context/v1'or c->>'owner_id' is distinct from p_user::text or c->>'thread_id' is distinct from p_thread::text
 or c#>'{binding,epoch}' is distinct from to_jsonb(p_epoch)or c#>'{binding,account_version}' is distinct from to_jsonb(p_version+1)or c#>'{binding,thread_revision}' is distinct from to_jsonb(p_revision+1)
 or (p_spec->>'canonical_context_digest_text')::jsonb is distinct from jsonb_set(c-'captured_at','{binding}',(c->'binding')-'context_sha256')
 or c#>>'{binding,context_sha256}' is distinct from encode(sha256(convert_to(p_spec->>'canonical_context_digest_text','UTF8')),'hex')
 or p_spec#>>'{host_snapshot,scope,userId}' is distinct from p_user::text
 or p_spec->>'generation_payload' is distinct from encode(sha256(convert_to(p_spec->>'generation_wire_body','UTF8')),'hex')
 or (p_spec->>'generation_input')::bigint is distinct from octet_length(p_spec->>'generation_wire_body')
 or p_spec->>'verification_envelope' is distinct from encode(sha256(convert_to(p_spec->>'verification_envelope_text','UTF8')),'hex')
 or(wire#>>'{messages,-1,content}')::jsonb is distinct from jsonb_build_object('kind','career_native_generation_request/v1','request',q)
 or jsonb_typeof(p_spec->'fallback_reply')is distinct from 'string'or jsonb_typeof(p_spec->'uncertain_reply')is distinct from 'string'or jsonb_typeof(p_spec->'no_call_reply')is distinct from 'string'
 or exists(select 1 from jsonb_array_elements((c->'facts')||(c->'sources')||(c->'dialogue')||(c->'goals')||(c->'pending_asks')||(c->'invalidations')||(c->'tool_status')||(c->'receipts')||(c->'artifacts')||(c->'assessments')||case when jsonb_typeof(c->'current_draft')='object'then jsonb_build_array(c->'current_draft')else '[]'::jsonb end)x where x#>>'{scope,owner_id}'is distinct from p_user::text or(x#>>'{scope,kind}'='thread'and x#>>'{scope,thread_id}'is distinct from p_thread::text))
 or exists(select 1 from jsonb_array_elements(c->'sources')x where x->>'source_sha256'is distinct from encode(sha256(convert_to(x->>'content','UTF8')),'hex'))then raise exception 'invalid exact native execution specification';end if;
 select *into pol from career_model_pair_policy_v2 where policy_digest=p_spec->>'policy_digest'and active;
 if pol.policy_digest is null or pol.generation_config_digest is distinct from p_spec->>'generation_config_digest'or pol.verification_config_digest is distinct from p_spec->>'verification_config_digest'
 or pol.provider is distinct from 'openai'or pol.model is distinct from wire->>'model'or (p_spec->>'generation_output')::bigint is distinct from (wire->>'max_completion_tokens')::bigint then reason:='policy_unavailable';end if;
 if reason is null then p:=career_model_pair_reserve_v2(p_user,p_thread,p_key,p_hash,p_revision,p_version,p_epoch,p_spec->>'policy_digest',p_spec->>'generation_payload',p_spec->>'verification_envelope',(p_spec->>'generation_input')::bigint,(p_spec->>'generation_output')::bigint,(p_spec->>'verification_input')::bigint,(p_spec->>'verification_output')::bigint);if p->>'ok' is distinct from 'true'then reason:=p->>'reason';end if;end if;
 e:=jsonb_build_object('execution_id',gen_random_uuid(),'owner_id',p_user,'thread_id',p_thread,'turn_key',p_key,'request_hash',p_hash,'epoch',p_epoch,'intent',q->'intent','spec',p_spec,'pair_id',case when reason is null then p->'pair_id'else 'null'::jsonb end,'state',case when reason is null then 'claimed'else 'closed'end,'observations','{}'::jsonb,'reason',reason);
 insert into career_watch_kv(user_id,key,value)values(p_user,'career:native-execution:'||p_thread||':'||p_key,e);
 return jsonb_build_object('execution',e,'is_new',true);
end $$;$up_5971fd5cd74eb6407aa6a223$;
-- supabase/sql/proposals/career_native_execution_v1.sql statement 3
EXECUTE $up_88a6732bf19ce69099214823$

create function public.career_native_checker_prepare_v1(p_user uuid,p_thread uuid,p_key text,p_execution uuid,p_wire text)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare e jsonb;wire jsonb;input jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));select value into e from career_watch_kv where user_id=p_user and key='career:native-execution:'||p_thread||':'||p_key for update;
 wire:=p_wire::jsonb;input:=(wire#>>'{messages,-1,content}')::jsonb;
 if e is null or e->>'execution_id' is distinct from p_execution::text or e->>'state' is distinct from 'claimed'
 or octet_length(p_wire)>(e#>>'{spec,verification_input}')::bigint or wire->>'model' is distinct from((e#>>'{spec,generation_wire_body}')::jsonb->>'model')
 or(wire->>'max_completion_tokens')::bigint is distinct from(e#>>'{spec,verification_output}')::bigint
 or input->>'kind' is distinct from 'career_native_checker_request/v1'or input->'request' is distinct from(e#>>'{spec,canonical_request}')::jsonb
 or input->'candidate' is distinct from(e#>>'{observations,generation,text}')::jsonb
 or input->>'request_digest' is distinct from e#>>'{spec,request_digest}'or input->>'intent_sha256' is distinct from e#>>'{spec,intent_sha256}'
 or input->>'context_sha256' is distinct from(((e#>>'{spec,canonical_request}')::jsonb)#>>'{context,binding,context_sha256}')
 or input->>'user_text_sha256' is distinct from e#>>'{intent,user_text_sha256}'
 or input->>'rendered_sha256' is distinct from encode(sha256(convert_to(input->>'rendered_response','UTF8')),'hex')
 or input->>'candidate_sha256' is distinct from encode(sha256(convert_to(input->>'canonical_candidate','UTF8')),'hex')or(input->>'canonical_candidate')::jsonb is distinct from input->'candidate'
 or(e->>'verification_wire_body' is not null and e->>'verification_wire_body' is distinct from p_wire)then raise exception 'invalid immutable native checker request';end if;
 update career_watch_kv set value=value||jsonb_build_object('verification_wire_body',p_wire),updated_at=now()where user_id=p_user and key='career:native-execution:'||p_thread||':'||p_key;
 return jsonb_build_object('ok',true);
end $$;$up_88a6732bf19ce69099214823$;
-- supabase/sql/proposals/career_native_execution_v1.sql statement 4
EXECUTE $up_ebe1af8726731ace608f1d65$

create function public.career_native_leg_consume_v1(p_user uuid,p_thread uuid,p_key text,p_execution uuid,p_kind text,p_payload text,p_envelope text,p_input bigint,p_output bigint)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare e jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));select value into e from career_watch_kv where user_id=p_user and key='career:native-execution:'||p_thread||':'||p_key;
 if e is null or e->>'execution_id' is distinct from p_execution::text or e->>'state' is distinct from 'claimed'then return jsonb_build_object('ok',false,'reason','execution_fenced');end if;
 if p_kind='verification'and(p_payload is distinct from encode(sha256(convert_to(e->>'verification_wire_body','UTF8')),'hex')or p_input is distinct from octet_length(e->>'verification_wire_body'))then return jsonb_build_object('ok',false,'reason','checker_payload_not_durable');end if;
 return career_model_leg_consume_v2(p_user,(e->>'pair_id')::uuid,p_kind,p_payload,p_envelope,p_input,p_output);
end $$;$up_ebe1af8726731ace608f1d65$;
-- supabase/sql/proposals/career_native_execution_v1.sql statement 5
EXECUTE $up_6ac92cfee6ad8fd94cd46bf5$

create function public.career_native_observe_v1(p_user uuid,p_thread uuid,p_key text,p_execution uuid,p_kind text,p_receipt jsonb,p_text text)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare e jsonb;old jsonb;l career_model_pair_legs_v2;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));select value into e from career_watch_kv where user_id=p_user and key='career:native-execution:'||p_thread||':'||p_key for update;
 select *into l from career_model_pair_legs_v2 where pair_id=(e->>'pair_id')::uuid and user_id=p_user and thread_id=p_thread and kind=p_kind;
 if e is null or e->>'execution_id' is distinct from p_execution::text or l.dispatched_payload is null or p_kind not in('generation','verification')or p_receipt->>'request_body_sha256' is distinct from l.dispatched_payload or p_receipt->>'config_digest' is distinct from l.config_digest or octet_length(coalesce(p_text,''))>50000 then raise exception 'invalid native provider observation';end if;
 old:=e#>array['observations',p_kind];if old is not null and(old->'receipt' is distinct from p_receipt or(old->>'text'is not null and p_text is not null and old->>'text'is distinct from p_text))then raise exception 'native provider observation conflict';end if;
 update career_watch_kv set value=jsonb_set(value,array['observations',p_kind],jsonb_build_object('receipt',p_receipt,'text',coalesce(p_text,old->>'text'))),updated_at=now()where user_id=p_user and key='career:native-execution:'||p_thread||':'||p_key;
 return jsonb_build_object('ok',true);
end $$;$up_6ac92cfee6ad8fd94cd46bf5$;
-- supabase/sql/proposals/career_native_execution_v1.sql statement 6
EXECUTE $up_f1c123933a5ae40a37f96e1b$

create function public.career_native_fence_v1(p_user uuid,p_thread uuid,p_key text,p_execution uuid)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare e jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));select value into e from career_watch_kv where user_id=p_user and key='career:native-execution:'||p_thread||':'||p_key for update;
 if e is null or e->>'execution_id'is distinct from p_execution::text then raise exception 'native execution unavailable';end if;
 if e->>'state'='claimed'then update career_watch_kv set value=value||jsonb_build_object('state','unknown'),updated_at=now()where user_id=p_user and key='career:native-execution:'||p_thread||':'||p_key;end if;
 update career_model_reservations_v1 set expires_at=least(expires_at,clock_timestamp())where user_id=p_user and state='started'and id in(select ticket_id from career_model_pair_legs_v2 where pair_id=(e->>'pair_id')::uuid and user_id=p_user);
 return jsonb_build_object('ok',true);
end $$;$up_f1c123933a5ae40a37f96e1b$;
-- supabase/sql/proposals/career_native_execution_v1.sql statement 7
EXECUTE $up_14fbd2b323367b359eb7df9e$

create function public.career_native_outcome_v1(p_user uuid,p_thread uuid,p_key text,p_execution uuid,p_result jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare e jsonb;p jsonb;check_input jsonb;checker jsonb;claim jsonb;checked jsonb;k text;role_name text;leg jsonb;reported jsonb;raw_receipt jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));select value into e from career_watch_kv where user_id=p_user and key='career:native-execution:'||p_thread||':'||p_key for update;
 if e is null or e->>'execution_id' is distinct from p_execution::text or p_result->>'status'not in('generated','unavailable','unknown')or octet_length(p_result::text)>100000 then raise exception 'invalid native outcome';end if;
 if e->'result'=p_result then return jsonb_build_object('execution',e);end if;
 if e->>'pair_id'is not null then p:=career_model_pair_read_v2(p_user,(e->>'pair_id')::uuid);else p:=jsonb_build_object('accounting_state','settled','provider_calls_confirmed',0,'provider_calls_possible',0,'known_cost_micros',0,'uncertain_micros',0);end if;
 if e?'result'and not(e#>>'{result,status}'='unknown'and p_result->>'status'='unavailable'and p->>'accounting_state'='settled')then raise exception 'terminal native outcome conflict';end if;
 if p_result#>>'{meta,contract}'is distinct from 'native_pair_v1'or p_result#>>'{meta,verification,cost_policy}'is distinct from 'paired_gateway_budgeted/v1'or p_result#>'{meta,pair_id}'is distinct from e->'pair_id'
 or p_result#>>'{meta,status}'is distinct from p_result->>'status'or p_result#>>'{meta,operation_id}'is distinct from e->>'execution_id'or p_result#>>'{meta,request_digest}'is distinct from e#>>'{spec,request_digest}'or p_result#>>'{meta,context_sha256}'is distinct from(((e#>>'{spec,canonical_request}')::jsonb)#>>'{context,binding,context_sha256}')
 or p_result#>'{meta,provider_calls_confirmed}'is distinct from p->'provider_calls_confirmed'or p_result#>>'{meta,accounting_state}'is distinct from p->>'accounting_state'
 or p_result#>'{meta,provider_calls_possible}'is distinct from p->'provider_calls_possible'or p_result#>'{meta,known_cost_micros}'is distinct from p->'known_cost_micros'or p_result#>'{meta,uncertain_micros}'is distinct from p->'uncertain_micros'or p_result#>>'{meta,accounting_source}'is distinct from 'career_model_pair_read_v2'
 or p_result#>>'{meta,intent_sha256}'is distinct from e#>>'{spec,intent_sha256}'or p_result#>>'{meta,user_text_sha256}'is distinct from e#>>'{intent,user_text_sha256}'then raise exception 'native paid provenance mismatch';end if;
 foreach k in array array['generation','verification']loop
  role_name:=case when k='verification'then 'checker'else 'generation'end;leg:=p->k;reported:=p_result#>array['meta','legs',role_name];
  select raw_usage_receipt into raw_receipt from career_model_pair_legs_v2 where pair_id=(e->>'pair_id')::uuid and user_id=p_user and kind=k;
  if reported->>'state'is distinct from coalesce(leg->>'state','not_sent')or reported->'final'is distinct from to_jsonb(leg is null or leg->>'state'in('recorded','not_sent'))
  or reported->'cost_micros'is distinct from(case when leg->>'state'='recorded'then leg->'cost_micros'else '0'::jsonb end)
  or reported->'provider_request_ids'is distinct from(case when leg->>'state'='recorded'then jsonb_build_array(raw_receipt->>'response_id')else '[]'::jsonb end)
  or(leg->>'state'='recorded'and reported->'raw_usage_receipt'is distinct from raw_receipt)
  or p_result#>array['meta','bounds_micros',role_name]is distinct from coalesce(leg->'bound_micros','0'::jsonb)then raise exception 'native usage metadata mismatch';end if;
 end loop;
 if p_result#>'{meta,legs,other}'is distinct from '{"state":"not_sent","final":true,"cost_micros":0,"provider_request_ids":[]}'::jsonb or p_result#>'{meta,bounds_micros,other}'is distinct from '0'::jsonb or p_result#>'{meta,parent_bound_micros}'is distinct from coalesce(p->'parent_bound_micros','0'::jsonb)then raise exception 'native whole-call metadata mismatch';end if;
 if p_result->>'status'='generated'then
  checker:=(e#>>'{observations,verification,text}')::jsonb;check_input:=((e->>'verification_wire_body')::jsonb#>>'{messages,-1,content}')::jsonb;
  if e->>'state'is distinct from 'claimed'or p->>'accounting_state' is distinct from 'settled'or p->>'provider_calls_confirmed'is distinct from '2'or p->>'contextCurrent'is distinct from 'true'
  or e#>'{observations,generation,receipt}'is distinct from p#>'{generation,raw_usage_receipt}'or e#>'{observations,verification,receipt}'is distinct from p#>'{verification,raw_usage_receipt}'
  or p_result->'candidate'is distinct from(e#>>'{observations,generation,text}')::jsonb or p_result->'candidate'is distinct from check_input->'candidate'
  or p_result->>'rendered_response'is distinct from check_input->>'rendered_response'or p_result->>'rendered_sha256'is distinct from check_input->>'rendered_sha256'
  or checker->>'version'is distinct from 'career_native_checker/v1'or checker->>'verdict'is distinct from 'supported'or checker->'whole_response_checked'is distinct from 'true'::jsonb or checker->'authority_safe'is distinct from 'true'::jsonb or checker->'unlisted_claims'is distinct from '[]'::jsonb
  or checker->>'request_digest'is distinct from e#>>'{spec,request_digest}'or checker->>'intent_sha256'is distinct from e#>>'{spec,intent_sha256}'or checker->>'user_text_sha256'is distinct from e#>>'{intent,user_text_sha256}'
  or checker->>'context_sha256'is distinct from check_input->>'context_sha256'or checker->>'candidate_sha256'is distinct from check_input->>'candidate_sha256'or checker->>'rendered_sha256'is distinct from check_input->>'rendered_sha256'
  or jsonb_array_length(checker->'claims')is distinct from jsonb_array_length(p_result#>'{candidate,claims}')then raise exception 'native independent checker proof missing';end if;
  for claim in select value from jsonb_array_elements(p_result#>'{candidate,claims}')loop
   select value into checked from jsonb_array_elements(checker->'claims')where value->>'id'=claim->>'id';
   if checked is null or checked->>'verdict'is distinct from 'entailed'or not((checked->'evidence_ids')@>(claim->'evidence_ids')and(claim->'evidence_ids')@>(checked->'evidence_ids'))then raise exception 'native claim not checked';end if;
  end loop;
  update career_model_pairs_v2 set publication_state='verified_uncommitted'where id=(e->>'pair_id')::uuid and user_id=p_user;
 elsif p_result->>'rendered_response'is distinct from(case when p->>'accounting_state'='uncertain'then e#>>'{spec,uncertain_reply}'when coalesce((p->>'provider_calls_possible')::int,0)=0 then e#>>'{spec,no_call_reply}'else e#>>'{spec,fallback_reply}'end)then raise exception 'unchecked native text publication';end if;
 if p->>'accounting_state'='uncertain'then update career_model_reservations_v1 set expires_at=least(expires_at,clock_timestamp())where user_id=p_user and state='started'and id in(select ticket_id from career_model_pair_legs_v2 where pair_id=(e->>'pair_id')::uuid and user_id=p_user);end if;
 e:=e||jsonb_build_object('state',case when p->>'accounting_state'='uncertain'then 'unknown'else 'closed'end,'result',p_result);
 update career_watch_kv set value=e,updated_at=now()where user_id=p_user and key='career:native-execution:'||p_thread||':'||p_key;return jsonb_build_object('execution',e);
end $$;$up_14fbd2b323367b359eb7df9e$;
-- supabase/sql/proposals/career_native_execution_v1.sql statement 8
EXECUTE $up_d1ed66ea75c737266d7b4e5f$

-- Exact replay is an accounting readback, never another dispatch or a memory
-- commit. A duplicate can save an uncertain snapshot before the original leg
-- settles. Derive later readbacks from the same owner-bound pair, retaining
-- the immutable fallback and never reconstructing missing provider text.
create function public.career_native_replay_v1(p_user uuid,p_thread uuid,p_key text,p_hash text)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare loaded jsonb;e jsonb;a jsonb;p jsonb;response jsonb;m jsonb;accounting jsonb;legs jsonb;leg jsonb;k text;role_name text;status text;as_of timestamptz;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 loaded:=career_host_load(p_user,p_thread,p_key,p_hash);if loaded?'error'then return loaded;end if;
 if loaded->'replay'is null then return jsonb_build_object('error','native_replay_missing');end if;
 select value into a from career_watch_kv where user_id=p_user and key='career:account';
 if a->'paused'='true'::jsonb or career_model_replay_check_v2(p_user,p_thread,p_key,p_hash)->>'ok'is distinct from 'true'then return jsonb_build_object('error','career_model_context_changed');end if;
 e:=career_native_read_v1(p_user,p_thread,p_key,p_hash);if e?'error'then return e;end if;e:=e->'execution';
 response:=loaded->'replay';m:=response#>'{meta,career_model}';
 if e is null or e->>'execution_id'is distinct from m->>'operation_id'or e->'pair_id'is distinct from m->'pair_id'or e->'result'is null or m->>'contract'is distinct from 'native_pair_v1'then return jsonb_build_object('error','native_replay_missing');end if;
 -- Generated and already-final snapshots retain exact replay bytes. Existing
 -- dialogue/epoch/pause checks above still revoke stale publication.
 if m->>'status'<>'unknown'or e->>'pair_id'is null then return jsonb_build_object('response',response);end if;
 p:=career_model_pair_read_v2(p_user,(e->>'pair_id')::uuid);
 if p->>'ok'is distinct from 'true'then return jsonb_build_object('error','native_replay_missing');end if;
 legs:='{"other":{"state":"not_sent","final":true,"cost_micros":0,"provider_request_ids":[]}}'::jsonb;
 foreach k in array array['generation','verification']loop
  role_name:=case when k='verification'then 'checker'else 'generation'end;leg:=p->k;
  legs:=legs||jsonb_build_object(role_name,jsonb_build_object('state',leg->'state','final',leg->>'state'in('recorded','not_sent'),'cost_micros',case when leg->>'state'='recorded'then leg->'cost_micros'else '0'::jsonb end,'provider_request_ids',case when leg->>'state'='recorded'then jsonb_build_array(leg->>'provider_response_id')else '[]'::jsonb end)||case when leg->>'state'='recorded'then jsonb_build_object('raw_usage_receipt',leg->'raw_usage_receipt')else '{}'::jsonb end);
 end loop;
 accounting:=jsonb_build_object('legs',legs,'provider_calls_confirmed',p->'provider_calls_confirmed','provider_calls_possible',p->'provider_calls_possible','accounting_state',p->'accounting_state','known_cost_micros',p->'known_cost_micros','uncertain_micros',p->'uncertain_micros');
 if m@>accounting then return jsonb_build_object('response',response);end if;
 select max(settled_at)into as_of from career_model_pair_legs_v2 where pair_id=(e->>'pair_id')::uuid and user_id=p_user and thread_id=p_thread;
 status:=case when p->>'accounting_state'='settled'then 'unavailable'else 'unknown'end;
 m:=m||accounting||jsonb_build_object('status',status,'accounting_as_of',as_of,'accounting_source','career_model_pair_read_v2','failure_kind','reconciled_without_redispatch');
 response:=jsonb_set(jsonb_set(response,'{meta,career_model}',m),'{reply}',case when status='unknown'then e#>'{spec,uncertain_reply}'else e#>'{spec,fallback_reply}'end);
 return jsonb_build_object('response',response);
end $$;$up_d1ed66ea75c737266d7b4e5f$;
-- supabase/sql/proposals/career_native_execution_v1.sql statement 9
EXECUTE $up_10b61eac2ca1a88b41d98e2c$
revoke all on function public.career_native_replay_v1(uuid,uuid,text,text)from public,anon,authenticated;$up_10b61eac2ca1a88b41d98e2c$;
-- supabase/sql/proposals/career_native_execution_v1.sql statement 10
EXECUTE $up_1cf230756bafece36ad78cc9$
grant execute on function public.career_native_replay_v1(uuid,uuid,text,text)to service_role;$up_1cf230756bafece36ad78cc9$;
-- supabase/sql/proposals/career_native_execution_v1.sql statement 11
EXECUTE $up_10b8c7c338493763de7b5326$

create function public.career_native_turn_commit_v1(p_base jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare u uuid:=(p_base->>'p_user')::uuid;t uuid:=(p_base->>'p_thread')::uuid;e jsonb;saved jsonb;p jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 saved:=career_host_load(u,t,p_base->>'p_key',p_base->>'p_hash');if saved?'error'then return saved;end if;if saved?'replay'then return career_native_replay_v1(u,t,p_base->>'p_key',p_base->>'p_hash')||jsonb_build_object('replay',true);end if;
 select value into e from career_watch_kv where user_id=u and key='career:native-execution:'||t||':'||(p_base->>'p_key');
 if e is not null and((p_base->>'p_revision')::bigint is distinct from(e#>>'{intent,expected_binding,thread_revision}')::bigint or(p_base->>'p_account_version')::bigint is distinct from(e#>>'{intent,expected_binding,account_version}')::bigint)then return jsonb_build_object('error','revision_conflict');end if;
 if e is null or e->>'request_hash'is distinct from p_base->>'p_hash'or e->'result'is null or p_base->'p_snapshot'is distinct from e#>'{spec,host_snapshot}'or coalesce(p_base->'p_patch','{}'::jsonb)<>'{}'::jsonb
 or p_base->>'p_input'is distinct from e#>>'{intent,user_text}'or p_base#>>'{p_response,reply}'is distinct from e#>>'{result,rendered_response}'or p_base#>'{p_response,meta,career_model}'is distinct from e#>'{result,meta}'then raise exception 'native publication binding mismatch';end if;
 if e#>>'{result,status}'='generated'then p:=career_model_pair_read_v2(u,(e->>'pair_id')::uuid);if p->>'contextCurrent'is distinct from 'true'or p->>'publication_state'is distinct from 'verified_uncommitted'then return jsonb_build_object('error','career_model_context_changed');end if;end if;
 saved:=career_host_commit(u,t,p_base->>'p_key',p_base->>'p_hash',(p_base->>'p_revision')::bigint,(p_base->>'p_account_version')::bigint,p_base->'p_snapshot','{}'::jsonb,p_base->>'p_input',p_base->'p_response');if saved?'error'then return saved;end if;
 insert into career_watch_kv(user_id,key,value)values(u,'career:native-context:'||t,(e#>>'{spec,canonical_request}')::jsonb->'context')on conflict(user_id,key)do update set value=excluded.value,updated_at=now();
 if e#>>'{result,status}'='generated'then update career_model_pairs_v2 set publication_state='published'where id=(e->>'pair_id')::uuid and user_id=u;end if;
 return saved;
end $$;$up_10b8c7c338493763de7b5326$;
-- supabase/sql/proposals/career_native_execution_v1.sql statement 12
EXECUTE $up_f46528cc2281c7c558743deb$
revoke all on function public.career_native_read_v1(uuid,uuid,text,text),public.career_native_claim_v1(uuid,uuid,text,text,bigint,bigint,bigint,jsonb),public.career_native_checker_prepare_v1(uuid,uuid,text,uuid,text),public.career_native_leg_consume_v1(uuid,uuid,text,uuid,text,text,text,bigint,bigint),public.career_native_observe_v1(uuid,uuid,text,uuid,text,jsonb,text),public.career_native_fence_v1(uuid,uuid,text,uuid),public.career_native_outcome_v1(uuid,uuid,text,uuid,jsonb),public.career_native_turn_commit_v1(jsonb)from public,anon,authenticated;$up_f46528cc2281c7c558743deb$;
-- supabase/sql/proposals/career_native_execution_v1.sql statement 13
EXECUTE $up_7bba45e40c3d330917fd3a38$
grant execute on function public.career_native_read_v1(uuid,uuid,text,text),public.career_native_claim_v1(uuid,uuid,text,text,bigint,bigint,bigint,jsonb),public.career_native_checker_prepare_v1(uuid,uuid,text,uuid,text),public.career_native_leg_consume_v1(uuid,uuid,text,uuid,text,text,text,bigint,bigint),public.career_native_observe_v1(uuid,uuid,text,uuid,text,jsonb,text),public.career_native_fence_v1(uuid,uuid,text,uuid),public.career_native_outcome_v1(uuid,uuid,text,uuid,jsonb),public.career_native_turn_commit_v1(jsonb)to service_role;$up_7bba45e40c3d330917fd3a38$;
-- supabase/sql/proposals/career_owned_claim_recovery_v1.sql statement 1
EXECUTE $up_c60aa441ee8764cb0d71e606$-- SOURCE-ONLY proposal; apply after career_public_research_v1.sql. Not deployed.
-- Retains the existing owner lock, account/version/epoch, service-only RPCs,
-- intent expiry, effect ledger and global one-submit uniqueness constraint.
alter table public.career_task_intents_v1 add column claim_worker uuid,
 add column claim_request uuid, add column claim_generation integer not null default 0,
 add column claim_lease_until timestamptz;$up_c60aa441ee8764cb0d71e606$;
-- supabase/sql/proposals/career_owned_claim_recovery_v1.sql statement 2
EXECUTE $up_64ac5afdfda53696ffbd7e8d$

create function public.career_task_owned_grant_v1(i public.career_task_intents_v1) returns jsonb language sql immutable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('version','career_task_intent/v1','intentId',i.intent_id,'userId',i.user_id,'taskId',i.task_id,'accountVersion',i.authority_account_version,'privacyEpoch',i.privacy_epoch,'leaseToken',i.lease_token,'binding',i.binding,'request',i.private_input,'workerId',i.claim_worker,'claimRequest',i.claim_request,'generation',i.claim_generation);
$$;$up_64ac5afdfda53696ffbd7e8d$;
-- supabase/sql/proposals/career_owned_claim_recovery_v1.sql statement 3
EXECUTE $up_4079712088e44e85d668249f$

create function public.career_task_claim_owned_v1(p_user uuid,p_intent text,p_task text,p_worker uuid,p_request uuid,p_lease uuid default null,p_generation integer default 0) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare i career_task_intents_v1;a jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select * into i from career_task_intents_v1 where user_id=p_user and intent_id=p_intent for update;
 select value into a from career_watch_kv where user_id=p_user and key='career:account';
 if a is null or i.intent_id is null or i.state not in ('queued','claimed') or i.expires_at<=now() or i.privacy_epoch is distinct from coalesce((a->>'epoch')::bigint,0) or i.authority_account_version is distinct from (a->>'version')::bigint or (i.binding->>'action'<>'reconcile' and a->'paused'='true'::jsonb) then raise exception 'task authority revoked';end if;
 if p_worker is null or p_request is null or coalesce(p_task,'') !~ '^[a-f0-9]{32}$' or (i.task_id is not null and i.task_id<>p_task) then raise exception 'task binding mismatch';end if;
 if i.state='claimed' then
  if i.claim_worker is null then raise exception 'legacy task claim busy';end if;
  if i.claim_lease_until>now() then
   if i.claim_worker is distinct from p_worker or i.claim_request is distinct from p_request or (p_lease is not null and p_lease is distinct from i.lease_token) then raise exception 'task claim owner mismatch';end if;
   if p_lease is null and exists(select 1 from career_task_effects_v1 e where e.user_id=p_user and e.intent_id=p_intent) then raise exception 'task effect outcome uncertain';end if;
   return career_task_owned_grant_v1(i);
  end if;
  -- Reclaim is a CAS against an observed generation and is allowed only
  -- before any effect was admitted. Reserved effects also prevent replay.
  if p_generation is distinct from i.claim_generation or p_generation<1 then raise exception 'task stale claim generation';end if;
  if exists(select 1 from career_task_effects_v1 e where e.user_id=p_user and e.intent_id=p_intent) then raise exception 'task effect outcome uncertain';end if;
 elsif p_generation is distinct from 0 then raise exception 'task stale claim generation';
 end if;
 update career_task_intents_v1 set state='claimed',task_id=p_task,claim_worker=p_worker,claim_request=p_request,claim_generation=claim_generation+1,lease_token=gen_random_uuid(),claim_lease_until=least(expires_at,now()+interval '5 minutes'),updated_at=now() where user_id=p_user and intent_id=p_intent returning * into i;
 return career_task_owned_grant_v1(i);
end $$;$up_4079712088e44e85d668249f$;
-- supabase/sql/proposals/career_owned_claim_recovery_v1.sql statement 4
EXECUTE $up_a0c5aed45e8c0345c3a1835a$

create function public.career_task_claim_readback_v1(p_user uuid,p_intent text,p_worker uuid,p_request uuid) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare i career_task_intents_v1;a jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select * into i from career_task_intents_v1 where user_id=p_user and intent_id=p_intent for update;
 select value into a from career_watch_kv where user_id=p_user and key='career:account';
 if a is null or i.intent_id is null or i.state<>'claimed' or i.expires_at<=now() or i.privacy_epoch is distinct from coalesce((a->>'epoch')::bigint,0) or i.authority_account_version is distinct from (a->>'version')::bigint or (i.binding->>'action'<>'reconcile' and a->'paused'='true'::jsonb) then raise exception 'task authority revoked';end if;
 if p_worker is null or p_request is null or i.claim_worker is distinct from p_worker or i.claim_request is distinct from p_request then raise exception 'task claim owner mismatch';end if;
 if exists(select 1 from career_task_effects_v1 e where e.user_id=p_user and e.intent_id=p_intent) then return jsonb_build_object('state','uncertain');end if;
 if i.claim_lease_until<=now() then return jsonb_build_object('state','expired','generation',i.claim_generation);end if;
 return jsonb_build_object('state','claimed','grant',career_task_owned_grant_v1(i));
end $$;$up_a0c5aed45e8c0345c3a1835a$;
-- supabase/sql/proposals/career_owned_claim_recovery_v1.sql statement 5
EXECUTE $up_a744d798cad92cb1f9a457c3$

create function public.career_task_pending_owned_v1(p_worker uuid) returns jsonb language sql security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('intents',coalesce(jsonb_agg(jsonb_build_object('userId',i.user_id,'intentId',i.intent_id,'taskId',i.task_id,'binding',i.binding,'request',i.private_input)),'[]'::jsonb)) from
 (select i.* from career_task_intents_v1 i join career_watch_kv a on a.user_id=i.user_id and a.key='career:account'
 where p_worker is not null and (i.state='queued' or (i.state='claimed' and i.claim_worker=p_worker and not exists(select 1 from career_task_effects_v1 e where e.user_id=i.user_id and e.intent_id=i.intent_id)))
 and i.expires_at>now() and i.authority_account_version=(a.value->>'version')::bigint and i.privacy_epoch=coalesce((a.value->>'epoch')::bigint,0) and (i.binding->>'action'='reconcile' or a.value->'paused' is distinct from 'true'::jsonb) order by i.created_at limit 50)i;
$$;$up_a744d798cad92cb1f9a457c3$;
-- supabase/sql/proposals/career_owned_claim_recovery_v1.sql statement 6
EXECUTE $up_b7fac35aedeffcf099b3f6a5$

-- Scope precedes LIMIT. An owned task anchor in the current epoch authorizes
-- inspection of that owner's queued approval/reconcile intents, even though a
-- newer chat turn legitimately advanced the account version since preparation.
create index career_task_owned_scope_v1 on public.career_task_intents_v1(user_id,task_id,claim_worker,privacy_epoch) where claim_worker is not null;$up_b7fac35aedeffcf099b3f6a5$;
-- supabase/sql/proposals/career_owned_claim_recovery_v1.sql statement 7
EXECUTE $up_8b9f1f3399e0f0da8ac6620d$
create index career_task_pending_scope_v1 on public.career_task_intents_v1(user_id,(coalesce(task_id,binding->>'task_id')),created_at,intent_id) where state in ('queued','claimed');$up_8b9f1f3399e0f0da8ac6620d$;
-- supabase/sql/proposals/career_owned_claim_recovery_v1.sql statement 8
EXECUTE $up_339348505c64430e93fa824c$
create function public.career_task_pending_scoped_v1(p_worker uuid,p_user uuid,p_task text,p_limit integer default 50) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if p_worker is null or p_user is null or coalesce(p_task,'') !~ '^[a-f0-9]{32}$' or p_limit is null or p_limit<1 or p_limit>50 then raise exception 'invalid task pending scope';end if;
 return (
  select jsonb_build_object('intents',coalesce(jsonb_agg(jsonb_build_object('userId',i.user_id,'intentId',i.intent_id,'taskId',i.task_id,'binding',i.binding,'request',i.private_input) order by i.created_at,i.intent_id),'[]'::jsonb)) from (
   select i.* from career_task_intents_v1 i join career_watch_kv a on a.user_id=i.user_id and a.key='career:account'
   where i.user_id=p_user and coalesce(i.task_id,i.binding->>'task_id')=p_task
   and exists(select 1 from career_task_intents_v1 anchor where anchor.user_id=p_user and anchor.task_id=p_task and anchor.claim_worker=p_worker and anchor.privacy_epoch=coalesce((a.value->>'epoch')::bigint,0))
   and (i.state='queued' or (i.state='claimed' and i.claim_worker=p_worker and not exists(select 1 from career_task_effects_v1 e where e.user_id=i.user_id and e.intent_id=i.intent_id)))
   and i.expires_at>now() and i.authority_account_version=(a.value->>'version')::bigint and i.privacy_epoch=coalesce((a.value->>'epoch')::bigint,0)
   and (i.binding->>'action'='reconcile' or a.value->'paused' is distinct from 'true'::jsonb)
   order by i.created_at,i.intent_id limit p_limit
  )i
 );
end $$;$up_339348505c64430e93fa824c$;
-- supabase/sql/proposals/career_owned_claim_recovery_v1.sql statement 9
EXECUTE $up_803c8624675ede275a414820$

-- Existing reserve/consume functions already hold the account owner lock.
-- Every claim must meet absolute intent expiry at new-effect admission.
-- Owned claims additionally require a current owned lease. Receipt settlement
-- after dispatch is deliberately outside this admission-only effect branch.
create function public.career_task_owned_lease_fence_v1() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
declare i career_task_intents_v1;
begin
 if TG_TABLE_NAME='career_task_effects_v1' then
  if TG_OP='INSERT' or (NEW.state='started' and OLD.state is distinct from NEW.state) then
   select * into i from career_task_intents_v1 where user_id=NEW.user_id and intent_id=NEW.intent_id;
   if i.expires_at is null or i.expires_at<=clock_timestamp() then raise exception 'task intent expired';end if;
   if i.claim_worker is not null and (i.claim_lease_until is null or i.claim_lease_until<=clock_timestamp()) then raise exception 'task owned lease revoked';end if;
  end if;
 elsif NEW.state='completed' and OLD.state is distinct from NEW.state and OLD.claim_worker is not null and (OLD.claim_lease_until is null or OLD.claim_lease_until<=clock_timestamp() or OLD.expires_at<=clock_timestamp()) then raise exception 'task owned lease revoked';
 end if;return NEW;
end $$;$up_803c8624675ede275a414820$;
-- supabase/sql/proposals/career_owned_claim_recovery_v1.sql statement 10
EXECUTE $up_40a85469126c3a89f2adb5b3$
create trigger career_task_owned_effect_fence_v1 before insert or update on public.career_task_effects_v1 for each row execute function public.career_task_owned_lease_fence_v1();$up_40a85469126c3a89f2adb5b3$;
-- supabase/sql/proposals/career_owned_claim_recovery_v1.sql statement 11
EXECUTE $up_1d18c227dc2883af569df0c1$
create trigger career_task_owned_finish_fence_v1 before update on public.career_task_intents_v1 for each row execute function public.career_task_owned_lease_fence_v1();$up_1d18c227dc2883af569df0c1$;
-- supabase/sql/proposals/career_owned_claim_recovery_v1.sql statement 12
EXECUTE $up_3df5ac5e8b86e529711c99f5$
revoke all on function public.career_task_owned_grant_v1(public.career_task_intents_v1),public.career_task_claim_owned_v1(uuid,text,text,uuid,uuid,uuid,integer),public.career_task_claim_readback_v1(uuid,text,uuid,uuid),public.career_task_pending_owned_v1(uuid),public.career_task_pending_scoped_v1(uuid,uuid,text,integer),public.career_task_owned_lease_fence_v1() from public,anon,authenticated;$up_3df5ac5e8b86e529711c99f5$;
-- supabase/sql/proposals/career_owned_claim_recovery_v1.sql statement 13
EXECUTE $up_75817fd1eb8449c0b8311b3a$
grant execute on function public.career_task_owned_grant_v1(public.career_task_intents_v1),public.career_task_claim_owned_v1(uuid,text,text,uuid,uuid,uuid,integer),public.career_task_claim_readback_v1(uuid,text,uuid,uuid),public.career_task_pending_owned_v1(uuid),public.career_task_pending_scoped_v1(uuid,uuid,text,integer),public.career_task_owned_lease_fence_v1() to service_role;$up_75817fd1eb8449c0b8311b3a$;
-- supabase/sql/proposals/career_application_admissions_v1.sql statement 1
EXECUTE $up_fc427d67c449efbb681f1bc7$-- SOURCE ONLY. Apply after owned-claim recovery. No browser is enabled here.
-- An admission is a conservative quota reservation, NOT an employer receipt.
create table public.career_application_admissions_v1 (
 user_id uuid not null references auth.users(id) on delete cascade,
 task_id text not null, intent_id text not null, privacy_epoch bigint not null,
 company_key text not null, vendor text not null, admitted_at timestamptz not null,
 primary key(user_id,task_id),
 foreign key(user_id,intent_id) references public.career_task_intents_v1(user_id,intent_id)
);$up_fc427d67c449efbb681f1bc7$;
-- supabase/sql/proposals/career_application_admissions_v1.sql statement 2
EXECUTE $up_91cea31442039889c65c2508$
create index career_application_admissions_owner_time_v1 on public.career_application_admissions_v1(user_id,admitted_at);$up_91cea31442039889c65c2508$;
-- supabase/sql/proposals/career_application_admissions_v1.sql statement 3
EXECUTE $up_bdc81ef3bea0a21089c35d52$
alter table public.career_application_admissions_v1 enable row level security;$up_bdc81ef3bea0a21089c35d52$;
-- supabase/sql/proposals/career_application_admissions_v1.sql statement 4
EXECUTE $up_5dc761127fa13cdc0bc918c3$
revoke all on public.career_application_admissions_v1 from public,anon,authenticated;$up_5dc761127fa13cdc0bc918c3$;
-- supabase/sql/proposals/career_application_admissions_v1.sql statement 5
EXECUTE $up_87a6f49ef2629883f6b2c9d0$
grant select,insert on public.career_application_admissions_v1 to service_role;$up_87a6f49ef2629883f6b2c9d0$;
-- supabase/sql/proposals/career_application_admissions_v1.sql statement 6
EXECUTE $up_45224eac2cba03a8d2043b7f$
create policy career_application_admissions_backend_v1 on public.career_application_admissions_v1 for all to service_role using(true) with check(true);$up_45224eac2cba03a8d2043b7f$;
-- supabase/sql/proposals/career_application_admissions_v1.sql statement 7
EXECUTE $up_a73e76e06d3a829f1cdcad01$

create function public.career_application_admit_v1() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
declare i career_task_intents_v1; posting jsonb; company text; host text; vendor_key text;
 at_time timestamptz; day_start timestamptz; a jsonb;
begin
 if NEW.operation<>'submit' then return NEW;end if;
 perform pg_advisory_xact_lock(hashtextextended(NEW.user_id::text,0));
 select * into i from career_task_intents_v1 where user_id=NEW.user_id and intent_id=NEW.intent_id;
 select value into a from career_watch_kv where user_id=NEW.user_id and key='career:account';
 at_time:=clock_timestamp();day_start:=date_trunc('day',at_time at time zone 'UTC') at time zone 'UTC';
 if i.state is distinct from 'claimed' or i.binding->>'action' is distinct from 'approve'
  or i.task_id is distinct from NEW.task_id or i.expires_at<=at_time
  or (i.claim_worker is not null and (i.claim_lease_until is null or i.claim_lease_until<=at_time))
  or a is null or a->'paused'='true'::jsonb or i.authority_account_version is distinct from (a->>'version')::bigint
  or i.privacy_epoch is distinct from coalesce((a->>'epoch')::bigint,0) then raise exception 'task authority revoked';end if;
 -- Only the original owner-bound preparation can name this task's company
 -- and ATS. Caller-supplied approval fields cannot move it to another bucket.
 select p.private_input->'posting' into posting from career_task_intents_v1 p
  where p.user_id=NEW.user_id and p.task_id=NEW.task_id and p.binding->>'action'='prepare'
  and p.privacy_epoch=i.privacy_epoch and p.binding->>'resume_sha256'=i.binding->>'resume_sha256'
  order by p.created_at,p.intent_id limit 1;
 company:=trim(regexp_replace(regexp_replace(lower(coalesce(posting->>'company','')),'\(test\)',' ','g'),'[^a-z0-9 ]|\s+',' ','g'));
 company:=regexp_replace(company,'\s+',' ','g');
 host:=substring(lower(coalesce(posting->>'url','')) from '^https?://([^/:?#]+)');
 vendor_key:=case when host in ('localhost','127.0.0.1') then 'controlled_loopback'
  when host in ('boards.greenhouse.io','job-boards.greenhouse.io','boards.eu.greenhouse.io') then 'greenhouse'
  when host in ('jobs.lever.co','jobs.eu.lever.co') then 'lever'
  when host='jobs.ashbyhq.com' then 'ashby'
  when host='jobs.smartrecruiters.com' then 'smartrecruiters' else null end;
 if company='' or vendor_key is null then raise exception 'task submission accounting binding missing';end if;
 -- A deployment with older attempts must explicitly reconcile/backfill those
 -- rows first. Never silently pretend its historical usage was empty.
 if exists(select 1 from career_task_effects_v1 e where e.user_id=NEW.user_id and e.operation='submit'
  and not exists(select 1 from career_application_admissions_v1 q where q.user_id=e.user_id and q.task_id=e.task_id)) then raise exception 'task submission history incomplete';end if;
 if exists(select 1 from career_application_admissions_v1 where user_id=NEW.user_id and task_id=NEW.task_id) then raise exception 'task submit already admitted';end if;
 if (select count(*)from career_application_admissions_v1 where user_id=NEW.user_id and admitted_at>=day_start)>=15 then raise exception 'task submission cap reached: perDay';end if;
 if (select count(*)from career_application_admissions_v1 where user_id=NEW.user_id and vendor=vendor_key and admitted_at>=day_start)>=5 then raise exception 'task submission cap reached: perVendorPerDay';end if;
 if exists(select 1 from career_application_admissions_v1 where user_id=NEW.user_id and company_key=company and admitted_at>at_time-interval '30 days') then raise exception 'task submission cap reached: perCompanyPer30Days';end if;
 insert into career_application_admissions_v1 values(NEW.user_id,NEW.task_id,NEW.intent_id,i.privacy_epoch,company,vendor_key,at_time);
 return NEW;
end $$;$up_a73e76e06d3a829f1cdcad01$;
-- supabase/sql/proposals/career_application_admissions_v1.sql statement 8
EXECUTE $up_99779f7114165e80fb708852$
create trigger career_application_admission_v1 before insert on public.career_task_effects_v1 for each row execute function public.career_application_admit_v1();$up_99779f7114165e80fb708852$;
-- supabase/sql/proposals/career_application_admissions_v1.sql statement 9
EXECUTE $up_d84eb2869cbe37bf303f4c65$

create function public.career_application_admission_history_v1(p_user uuid,p_intent text,p_lease uuid,p_task text) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare i career_task_intents_v1;a jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select * into i from career_task_intents_v1 where user_id=p_user and intent_id=p_intent;
 select value into a from career_watch_kv where user_id=p_user and key='career:account';
 if i.state is distinct from 'claimed' or i.task_id is distinct from p_task or i.lease_token is distinct from p_lease
  or i.expires_at<=clock_timestamp() or (i.claim_worker is not null and (i.claim_lease_until is null or i.claim_lease_until<=clock_timestamp()))
  or a is null or a->'paused'='true'::jsonb or i.authority_account_version is distinct from (a->>'version')::bigint
  or i.privacy_epoch is distinct from coalesce((a->>'epoch')::bigint,0) then raise exception 'task authority revoked';end if;
 if exists(select 1 from career_task_effects_v1 e where e.user_id=p_user and e.operation='submit'
  and not exists(select 1 from career_application_admissions_v1 q where q.user_id=e.user_id and q.task_id=e.task_id)) then raise exception 'task submission history incomplete';end if;
 return jsonb_build_object('records',coalesce((select jsonb_agg(jsonb_build_object('userId',p_user,'status','submission_admitted','timestamp',admitted_at,'company',company_key,'vendor',vendor) order by admitted_at,task_id)
  from career_application_admissions_v1 where user_id=p_user and admitted_at>clock_timestamp()-interval '30 days'),'[]'::jsonb));
end $$;$up_d84eb2869cbe37bf303f4c65$;
-- supabase/sql/proposals/career_application_admissions_v1.sql statement 10
EXECUTE $up_adad74b544202937b1fdb18b$
revoke all on function public.career_application_admit_v1(),public.career_application_admission_history_v1(uuid,text,uuid,text) from public,anon,authenticated;$up_adad74b544202937b1fdb18b$;
-- supabase/sql/proposals/career_application_admissions_v1.sql statement 11
EXECUTE $up_21d1684b22da55b9a2dbbc97$
grant execute on function public.career_application_admit_v1(),public.career_application_admission_history_v1(uuid,text,uuid,text) to service_role;$up_21d1684b22da55b9a2dbbc97$;
-- supabase/sql/proposals/career_application_batch_v1.sql statement 1
EXECUTE $up_9168e9ba1e3a23c2da77c135$-- SOURCE ONLY. Apply after application admissions and owned claim recovery.
-- Workflow actions do not change shared career memory/account version. A
-- missing answer on one role must not revoke unrelated, unchanged approvals.
create table public.career_application_batches_v1(
 user_id uuid not null references auth.users(id) on delete cascade,
 batch_id uuid not null default gen_random_uuid(),thread_id uuid not null references agent_threads(id),
 account_version bigint not null,privacy_epoch bigint not null,created_at timestamptz not null default now(),
 primary key(user_id,batch_id)
);$up_9168e9ba1e3a23c2da77c135$;
-- supabase/sql/proposals/career_application_batch_v1.sql statement 2
EXECUTE $up_40f6a2703068ff1e222f13c2$
create table public.career_application_batch_roles_v1(
 user_id uuid not null,batch_id uuid not null,task_id text not null check(task_id~'^[a-f0-9]{32}$'),
 source_intent text not null,last_intent text not null,answer_revision integer not null default 0,
 answers jsonb not null default '[]',primary key(user_id,batch_id,task_id),
 foreign key(user_id,batch_id)references career_application_batches_v1 on delete cascade,
 foreign key(user_id,source_intent)references career_task_intents_v1(user_id,intent_id) on delete cascade,
 foreign key(user_id,last_intent)references career_task_intents_v1(user_id,intent_id) on delete cascade
);$up_40f6a2703068ff1e222f13c2$;
-- supabase/sql/proposals/career_application_batch_v1.sql statement 3
EXECUTE $up_ea9f44b92490d2c359a8de91$
create table public.career_application_batch_reviews_v1(
 user_id uuid not null,batch_id uuid not null,review_sha256 text not null,manifest jsonb not null,
 expires_at timestamptz not null,approved_at timestamptz,
 primary key(user_id,batch_id,review_sha256),
 foreign key(user_id,batch_id)references career_application_batches_v1 on delete cascade
);$up_ea9f44b92490d2c359a8de91$;
-- supabase/sql/proposals/career_application_batch_v1.sql statement 4
EXECUTE $up_c3a0eec7435b3a36cdc160ea$
create table public.career_application_batch_commands_v1(
 user_id uuid not null references auth.users(id) on delete cascade,request_key text not null,
 request_hash text not null,privacy_epoch bigint not null,response jsonb not null,
 created_at timestamptz not null default now(),primary key(user_id,request_key)
);$up_c3a0eec7435b3a36cdc160ea$;
-- supabase/sql/proposals/career_application_batch_v1.sql statement 5
EXECUTE $up_a15ccd63d5f3ef825bf3366a$
do $$declare n text;begin
 foreach n in array array['career_application_batches_v1','career_application_batch_roles_v1','career_application_batch_reviews_v1','career_application_batch_commands_v1']loop
  execute format('alter table public.%I enable row level security',n);
  execute format('revoke all on public.%I from public,anon,authenticated',n);
  execute format('grant select,insert,update,delete on public.%I to service_role',n);
  execute format('create policy backend_only on public.%I for all to service_role using(true) with check(true)',n);
 end loop;
end $$;$up_a15ccd63d5f3ef825bf3366a$;
-- supabase/sql/proposals/career_application_batch_v1.sql statement 6
EXECUTE $up_2cdc7612fe4614f8c20ed11e$

create function public.career_application_batch_context_v1(p_user uuid,p_thread uuid,p_batch uuid)
returns career_application_batches_v1 language plpgsql security invoker set search_path=public,pg_temp as $$
declare b career_application_batches_v1;a jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select * into b from career_application_batches_v1 where user_id=p_user and batch_id=p_batch;
 select value into a from career_watch_kv where user_id=p_user and key='career:account';
 if b.batch_id is null or b.thread_id is distinct from p_thread or not exists(select 1 from agent_threads where id=p_thread and user_id=p_user)
  or a is null or a->'paused'='true'::jsonb or b.account_version is distinct from (a->>'version')::bigint
  or b.privacy_epoch is distinct from coalesce((a->>'epoch')::bigint,0) then raise exception 'batch context revoked';end if;
 return b;
end $$;$up_2cdc7612fe4614f8c20ed11e$;
-- supabase/sql/proposals/career_application_batch_v1.sql statement 7
EXECUTE $up_42c47cbc01259ab2c0998316$

create function public.career_application_batch_progress_v1(p_user uuid,p_batch uuid)returns jsonb
language sql security invoker set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(jsonb_build_object('taskId',r.task_id,'intentId',r.last_intent,
 'answerRevision',r.answer_revision,'confirmedAnswerCount',jsonb_array_length(r.answers),
 'posting',s.private_input->'posting','status',case
  when exists(select 1 from career_task_effects_v1 e where e.user_id=r.user_id and e.task_id=r.task_id and e.operation='submit')
   then case when i.result->>'status'='completed' and i.result#>'{result,receipt}' is not null then 'completed' else 'unknown_outcome' end
  when exists(select 1 from career_task_effects_v1 e where e.user_id=r.user_id and e.task_id=r.task_id and e.state in('started','uncertain'))then 'needs_reconciliation'
  when i.result is not null then i.result->>'status'
  when i.state='queued' then 'queued' when i.state='claimed' then 'running' else 'requires_review' end,
 'task',i.result,'employerConfirmed',false) order by r.task_id),'[]'::jsonb)
 from career_application_batch_roles_v1 r join career_task_intents_v1 i on i.user_id=r.user_id and i.intent_id=r.last_intent
 join career_task_intents_v1 s on s.user_id=r.user_id and s.intent_id=r.source_intent
 where r.user_id=p_user and r.batch_id=p_batch;
$$;$up_42c47cbc01259ab2c0998316$;
-- supabase/sql/proposals/career_application_batch_v1.sql statement 8
EXECUTE $up_9b8714683a4274c83c6f6425$

create function public.career_application_batch_queue_v1(p_user uuid,p_batch uuid,p_task text,p_kind text,p_review jsonb default null)
returns text language plpgsql security invoker set search_path=public,pg_temp as $$
declare b career_application_batches_v1;r career_application_batch_roles_v1;s career_task_intents_v1;
 id text;event text;binding jsonb;payload jsonb;context jsonb;expiry timestamptz;
begin
 select * into b from career_application_batches_v1 where user_id=p_user and batch_id=p_batch;
 b:=career_application_batch_context_v1(p_user,b.thread_id,p_batch);
 select * into r from career_application_batch_roles_v1 where user_id=p_user and batch_id=p_batch and task_id=p_task for update;
 select * into s from career_task_intents_v1 where user_id=p_user and intent_id=r.source_intent;
 if r.task_id is null or s.private_input->'posting' is null or s.privacy_epoch<>b.privacy_epoch or p_kind not in('prepare','approve','reconcile') then raise exception 'batch preparation source missing';end if;
 if p_kind='reconcile' then
  if not exists(select 1 from career_task_effects_v1 where user_id=p_user and task_id=p_task and operation='submit')then raise exception 'batch reconcile not needed';end if;
 elsif exists(select 1 from career_task_effects_v1 where user_id=p_user and task_id=p_task and operation='submit')then raise exception 'batch reconcile required';end if;
 context:=jsonb_build_object('batchId',p_batch,'taskId',p_task,'answerRevision',r.answer_revision);
 id:=encode(sha256(convert_to(jsonb_build_array(p_user,p_batch,p_task,r.answer_revision,p_kind,p_review)::text,'UTF8')),'hex');event:='batch_'||substr(id,1,48);
 expiry:=clock_timestamp()+interval '10 minutes';
 binding:=jsonb_build_object('version','career_task_intent/v1','intent_id',id,'user_id',p_user,'thread_id',b.thread_id,'turn_key',event,
  'request_hash',id,'action',p_kind,'task_id',p_task,'event_id',event,'artifact_id',s.binding->>'artifact_id',
  'resume_sha256',s.binding->>'resume_sha256','payload_sha256',null,'profile_sha256',null,
  'destination',s.private_input#>>'{posting,url}','authority_account_version',b.account_version,'privacy_epoch',b.privacy_epoch);
 if p_kind='approve' then
  if p_review->>'taskId' is distinct from p_task or p_review->>'userId' is distinct from p_user::text
   or coalesce(p_review->>'payloadSha256','')!~'^[a-f0-9]{64}$' or coalesce(p_review->>'profileHash','')!~'^[a-f0-9]{64}$'
   or p_review->>'resumeSha256' is distinct from s.binding->>'resume_sha256'
   or p_review#>>'{eligibility,status}' is distinct from 'eligible' then raise exception 'batch exact review required';end if;
  expiry:=least(expiry,(p_review->>'expiresAt')::timestamptz);
  binding:=binding||jsonb_build_object('payload_sha256',p_review->>'payloadSha256','profile_sha256',p_review->>'profileHash','destination',p_review->>'destination');
  payload:=jsonb_build_object('batch',context);
 elsif p_kind='reconcile' then payload:=jsonb_build_object('batch',context);
 else payload:=s.private_input||jsonb_build_object('eventId',event,'batch',context);end if;
 if expiry<=clock_timestamp() then raise exception 'batch review expired';end if;
 insert into career_task_intents_v1(user_id,intent_id,thread_id,turn_key,request_hash,event_hash,binding,private_input,authority_account_version,privacy_epoch,task_id,expires_at)
 values(p_user,id,b.thread_id,event,id,encode(sha256(convert_to(p_user::text||':'||event,'UTF8')),'hex'),binding,payload,b.account_version,b.privacy_epoch,p_task,expiry);
 update career_application_batch_roles_v1 set last_intent=id where user_id=p_user and batch_id=p_batch and task_id=p_task;
 return id;
end $$;$up_9b8714683a4274c83c6f6425$;
-- supabase/sql/proposals/career_application_batch_v1.sql statement 9
EXECUTE $up_7ebe4073d4a089f7bae95fcb$

create function public.career_application_batch_control_v1(p_user uuid,p_thread uuid,p_request text,p_action text,p_input jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare a jsonb;b career_application_batches_v1;r career_application_batch_roles_v1;s career_task_intents_v1;i career_task_intents_v1;
 saved career_application_batch_commands_v1;review career_application_batch_reviews_v1;
 batch uuid;request_hash text;task text;entry jsonb;answer jsonb;question jsonb;new_answers jsonb;ready jsonb:='[]';held jsonb:='[]';manifest jsonb;
 result jsonb;review_hash text;expiry timestamptz;field_key text;allowed text[];
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select value into a from career_watch_kv where user_id=p_user and key='career:account';
 if a is null or a->'paused'='true'::jsonb or not exists(select 1 from agent_threads where id=p_thread and user_id=p_user) then raise exception 'batch context revoked';end if;
 if coalesce(p_request,'')!~'^[A-Za-z0-9_-]{1,128}$' or jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text)>65536 then raise exception 'invalid batch command';end if;
 allowed:=case p_action when 'create' then array['taskIds'] when 'review' then array['batchId'] when 'approve' then array['batchId','reviewHash','message'] when 'answers' then array['batchId','taskId','questionsHash','answers','message'] when 'reconcile' then array['batchId','taskId','message'] when 'status' then array['batchId'] else null end;
 if allowed is null then raise exception 'invalid batch command';end if;
 for field_key in select jsonb_object_keys(p_input)loop if not field_key=any(allowed)then raise exception 'unknown batch command field';end if;end loop;
 if p_action<>'create' then batch:=(p_input->>'batchId')::uuid;b:=career_application_batch_context_v1(p_user,p_thread,batch);end if;
 if p_action='status' then return jsonb_build_object('version','career_application_batch/v1','batchId',batch,'roles',career_application_batch_progress_v1(p_user,batch));end if;
 request_hash:=encode(sha256(convert_to(jsonb_build_array(p_thread,p_action,p_input)::text,'UTF8')),'hex');
 select * into saved from career_application_batch_commands_v1 where user_id=p_user and request_key=p_request;
 if saved.request_key is not null then
  if saved.request_hash is distinct from request_hash or saved.privacy_epoch is distinct from coalesce((a->>'epoch')::bigint,0) then raise exception 'batch command conflict';end if;
  if p_action='create' then perform career_application_batch_context_v1(p_user,p_thread,(saved.response->>'batchId')::uuid);end if;
  return saved.response;
 end if;
 if p_action='create' then
  if jsonb_typeof(p_input->'taskIds') is distinct from 'array' or jsonb_array_length(p_input->'taskIds') not between 1 and 100
   or (select count(distinct v)from jsonb_array_elements_text(p_input->'taskIds')v)<>jsonb_array_length(p_input->'taskIds') then raise exception 'exact distinct batch tasks required';end if;
  insert into career_application_batches_v1(user_id,thread_id,account_version,privacy_epoch)values(p_user,p_thread,(a->>'version')::bigint,coalesce((a->>'epoch')::bigint,0))returning * into b;batch:=b.batch_id;
  for task in select jsonb_array_elements_text(p_input->'taskIds')loop
   if task!~'^[a-f0-9]{32}$'then raise exception 'invalid batch task';end if;
   select * into s from career_task_intents_v1 where user_id=p_user and thread_id=p_thread and task_id=task and binding->>'action'='prepare' and privacy_epoch=b.privacy_epoch and private_input->'posting' is not null order by created_at,intent_id limit 1;
   if s.intent_id is null then raise exception 'owned batch task missing';end if;
   select * into i from career_task_intents_v1 where user_id=p_user and task_id=task and privacy_epoch=b.privacy_epoch order by updated_at desc,intent_id desc limit 1;
   insert into career_application_batch_roles_v1(user_id,batch_id,task_id,source_intent,last_intent)values(p_user,batch,task,s.intent_id,i.intent_id);
   if not exists(select 1 from career_task_effects_v1 where user_id=p_user and task_id=task and (operation='submit' or state in('reserved','started','uncertain')))then perform career_application_batch_queue_v1(p_user,batch,task,'prepare');end if;
  end loop;
  result:=jsonb_build_object('version','career_application_batch/v1','batchId',batch,'roles',career_application_batch_progress_v1(p_user,batch));
 elsif p_action='review' then
  expiry:=clock_timestamp()+interval '10 minutes';
  for entry in select * from jsonb_array_elements(career_application_batch_progress_v1(p_user,batch))loop
   if entry->>'status'='review_ready' and entry#>>'{task,review,authority,accountVersion}'=b.account_version::text
    and entry#>>'{task,review,authority,privacyEpoch}'=b.privacy_epoch::text and entry#>>'{task,review,eligibility,status}'='eligible'
    and (entry#>>'{task,review,expiresAt}')::timestamptz>clock_timestamp() then
    ready:=ready||jsonb_build_array(jsonb_build_object('taskId',entry->>'taskId','intentId',entry->>'intentId','posting',entry->'posting','review',entry#>'{task,review}'));
    expiry:=least(expiry,(entry#>>'{task,review,expiresAt}')::timestamptz);
   else held:=held||jsonb_build_array(jsonb_build_object('taskId',entry->>'taskId','status',entry->>'status','asks',entry#>'{task,asks}'));end if;
  end loop;
  if jsonb_array_length(ready)=0 then raise exception 'no batch roles ready';end if;
  manifest:=jsonb_build_object('version','career_application_batch_review/v1','batchId',batch,'userId',p_user,'threadId',p_thread,'accountVersion',b.account_version,'privacyEpoch',b.privacy_epoch,'roles',ready,'withheld',held);
  review_hash:=encode(sha256(convert_to(manifest::text,'UTF8')),'hex');
  insert into career_application_batch_reviews_v1(user_id,batch_id,review_sha256,manifest,expires_at)values(p_user,batch,review_hash,manifest,expiry)on conflict do nothing;
  select * into review from career_application_batch_reviews_v1 where user_id=p_user and batch_id=batch and review_sha256=review_hash;
  result:=jsonb_build_object('version','career_application_batch/v1','batchId',batch,'reviewHash',review_hash,'encoding','postgres-jsonb-text/v1','manifest',review.manifest,'expiresAt',review.expires_at,'approvalPhrase','Approve batch '||review_hash);
 elsif p_action='approve' then
  review_hash:=p_input->>'reviewHash';select * into review from career_application_batch_reviews_v1 where user_id=p_user and batch_id=batch and review_sha256=review_hash for update;
  if review.review_sha256 is null or review.approved_at is not null or review.expires_at<=clock_timestamp() or p_input->>'message' is distinct from 'Approve batch '||review_hash then raise exception 'exact fresh batch approval required';end if;
  for entry in select * from jsonb_array_elements(review.manifest->'roles')loop
   select * into r from career_application_batch_roles_v1 where user_id=p_user and batch_id=batch and task_id=entry->>'taskId';
   select * into i from career_task_intents_v1 where user_id=p_user and intent_id=r.last_intent;
   if r.last_intent is distinct from entry->>'intentId' or i.result->>'status' is distinct from 'review_ready' or i.result->'review' is distinct from entry->'review' then raise exception 'batch review changed';end if;
   perform career_application_batch_queue_v1(p_user,batch,r.task_id,'approve',entry->'review');
  end loop;
  update career_application_batch_reviews_v1 set approved_at=clock_timestamp()where user_id=p_user and batch_id=batch and review_sha256=review_hash;
  result:=jsonb_build_object('version','career_application_batch/v1','batchId',batch,'reviewHash',review_hash,'approvedTaskIds',(select jsonb_agg(v->>'taskId')from jsonb_array_elements(review.manifest->'roles')v),'status','queued','execution','separate_worker');
 elsif p_action='reconcile' then
  task:=p_input->>'taskId';
  if not exists(select 1 from career_application_batch_roles_v1 where user_id=p_user and batch_id=batch and task_id=task)or p_input->>'message' is distinct from 'Reconcile batch role '||task then raise exception 'exact role reconciliation required';end if;
  perform career_application_batch_queue_v1(p_user,batch,task,'reconcile',jsonb_build_object('requestId',p_request));
  result:=jsonb_build_object('version','career_application_batch/v1','batchId',batch,'taskId',task,'status','readback_queued','resubmitAuthorized',false);
 elsif p_action='answers' then
  task:=p_input->>'taskId';select * into r from career_application_batch_roles_v1 where user_id=p_user and batch_id=batch and task_id=task for update;
  select * into i from career_task_intents_v1 where user_id=p_user and intent_id=r.last_intent;
  if r.task_id is null or i.result->>'status' is distinct from 'awaiting_user' or i.result->>'questionsSha256' is distinct from p_input->>'questionsHash'
   or p_input->>'message' is distinct from 'Confirm answers for '||task||' '||(p_input->>'questionsHash') then raise exception 'exact role answer confirmation required';end if;
  if jsonb_typeof(p_input->'answers')is distinct from 'array' or jsonb_array_length(p_input->'answers')not between 1 and 50
   or (select count(distinct v->>'fieldId')from jsonb_array_elements(p_input->'answers')v)<>jsonb_array_length(p_input->'answers')then raise exception 'invalid role answers';end if;
  new_answers:=r.answers;
  for answer in select * from jsonb_array_elements(p_input->'answers')loop
   if jsonb_typeof(answer)is distinct from 'object' or (select count(*)from jsonb_object_keys(answer))<>3 or not answer?'fieldId' or not answer?'questionSha256' or not answer?'value'
    or jsonb_typeof(answer->'value')not in('string','boolean','number') or octet_length((answer->'value')::text)>4000 then raise exception 'invalid role answer';end if;
   select v into question from jsonb_array_elements(i.result->'asks')v where v->>'field_id'=answer->>'fieldId' and v->>'questionSha256'=answer->>'questionSha256' and v->'required'='true'::jsonb and v->'answerable'='true'::jsonb;
   if question is null then raise exception 'role question changed';end if;
   if question#>>'{field,kind}'='eligibility' and (jsonb_typeof(answer->'value') is distinct from question#>>'{field,answerType}' or (question#>>'{field,answerType}'='string' and (length(btrim(answer->>'value'))not between 1 and 300)))then raise exception 'invalid eligibility answer type';end if;
   select coalesce(jsonb_agg(v),'[]')into new_answers from jsonb_array_elements(new_answers)v where v->>'fieldId'<>answer->>'fieldId';
   new_answers:=new_answers||jsonb_build_array(answer||jsonb_build_object('source','user_explicit_role_confirmation','kind',coalesce(question#>>'{field,kind}','portal')));
  end loop;
  update career_application_batch_roles_v1 set answers=new_answers,answer_revision=answer_revision+1 where user_id=p_user and batch_id=batch and task_id=task;
  perform career_application_batch_queue_v1(p_user,batch,task,'prepare');
  result:=jsonb_build_object('version','career_application_batch/v1','batchId',batch,'taskId',task,'status','queued','submissionApproved',false);
 end if;
 insert into career_application_batch_commands_v1 values(p_user,p_request,request_hash,coalesce((a->>'epoch')::bigint,0),result,now());
 return result;
end $$;$up_7ebe4073d4a089f7bae95fcb$;
-- supabase/sql/proposals/career_application_batch_v1.sql statement 10
EXECUTE $up_63c0d562d775e4f6e24757ba$

create function public.career_application_batch_answers_v1(p_user uuid,p_intent text,p_lease uuid,p_task text)returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare i career_task_intents_v1;b career_application_batches_v1;r career_application_batch_roles_v1;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select * into i from career_task_intents_v1 where user_id=p_user and intent_id=p_intent;
 if i.state is distinct from 'claimed' or i.lease_token is distinct from p_lease or i.task_id is distinct from p_task or i.expires_at<=clock_timestamp()
  or(i.claim_worker is not null and(i.claim_lease_until is null or i.claim_lease_until<=clock_timestamp()))then raise exception 'batch task authority revoked';end if;
 b:=career_application_batch_context_v1(p_user,i.thread_id,(i.private_input#>>'{batch,batchId}')::uuid);
 select * into r from career_application_batch_roles_v1 where user_id=p_user and batch_id=b.batch_id and task_id=p_task;
 if r.task_id is null or i.authority_account_version<>b.account_version or i.privacy_epoch<>b.privacy_epoch or r.last_intent<>i.intent_id or r.answer_revision::text is distinct from i.private_input#>>'{batch,answerRevision}'then raise exception 'batch answer context revoked';end if;
 return jsonb_build_object('answers',r.answers,'answerRevision',r.answer_revision);
end $$;$up_63c0d562d775e4f6e24757ba$;
-- supabase/sql/proposals/career_application_batch_v1.sql statement 11
EXECUTE $up_484f87c8b3fd251d9bca03bd$

create function public.career_application_batch_erase_v1()returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
declare u uuid;
begin
 if coalesce(new.key,old.key)='career:account' and(TG_OP='DELETE' or(TG_OP='UPDATE' and coalesce((new.value->>'epoch')::bigint,0)<>coalesce((old.value->>'epoch')::bigint,0)))then
  u:=coalesce(new.user_id,old.user_id);delete from career_application_batches_v1 where user_id=u;delete from career_application_batch_commands_v1 where user_id=u;
 end if;return null;
end $$;$up_484f87c8b3fd251d9bca03bd$;
-- supabase/sql/proposals/career_application_batch_v1.sql statement 12
EXECUTE $up_b4adedf489d29a32f0a1c098$
create trigger career_application_batch_erase_v1 after update or delete on public.career_watch_kv for each row execute function public.career_application_batch_erase_v1();$up_b4adedf489d29a32f0a1c098$;
-- supabase/sql/proposals/career_application_batch_v1.sql statement 13
EXECUTE $up_6f01aecade1c978b974e17c8$
revoke all on function public.career_application_batch_context_v1(uuid,uuid,uuid),public.career_application_batch_progress_v1(uuid,uuid),public.career_application_batch_queue_v1(uuid,uuid,text,text,jsonb),public.career_application_batch_control_v1(uuid,uuid,text,text,jsonb),public.career_application_batch_answers_v1(uuid,text,uuid,text),public.career_application_batch_erase_v1()from public,anon,authenticated;$up_6f01aecade1c978b974e17c8$;
-- supabase/sql/proposals/career_application_batch_v1.sql statement 14
EXECUTE $up_b3fd1c7162ba85d4b69c265f$
grant execute on function public.career_application_batch_context_v1(uuid,uuid,uuid),public.career_application_batch_progress_v1(uuid,uuid),public.career_application_batch_queue_v1(uuid,uuid,text,text,jsonb),public.career_application_batch_control_v1(uuid,uuid,text,text,jsonb),public.career_application_batch_answers_v1(uuid,text,uuid,text),public.career_application_batch_erase_v1()to service_role;$up_b3fd1c7162ba85d4b69c265f$;
-- supabase/sql/proposals/career_applicant_resume_store_v1.sql statement 1
EXECUTE $up_ca4978367edfe0e3b219eb88$-- UNAPPLIED SOURCE PROPOSAL. Requires memory/task migrations and owned-claim
-- proposal already in this branch. No application sends, new account authority,
-- credentials, buckets, background jobs or fabricated legacy confirmations.
-- Existing snapshots contain no durable PDF/DOCX byte store. This is the minimal
-- new private byte record; profile basics remain unconfirmed and are NOT mapped.
create table public.career_applicant_resumes_v1 (
 user_id uuid not null references auth.users(id) on delete cascade,
 artifact_id text not null check(artifact_id ~ '^[A-Za-z0-9_-]{1,160}$'),
 version_id text not null check(version_id ~ '^[A-Za-z0-9_-]{1,160}$'),
 sequence bigint generated always as identity,
 privacy_epoch bigint not null check(privacy_epoch>=0),
 filename text not null check(length(filename) between 1 and 180 and filename !~ '[[:cntrl:]/\\]' and filename not in ('.','..')),
 content_type text not null check(content_type in ('application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
 content bytea not null check(octet_length(content) between 1 and 1048576),
 sha256 text generated always as (encode(sha256(content),'hex')) stored,
 confirmation_thread uuid not null references public.agent_threads(id),
 confirmation_account_version bigint not null,
 confirmation_key text not null,
 confirmation_ref text not null check(confirmation_ref ~ '^[A-Za-z0-9_-]{1,128}$'),
 confirmed_at timestamptz not null default now(),
 primary key(user_id,artifact_id,version_id),unique(user_id,confirmation_key),
 foreign key(user_id,confirmation_key) references public.career_watch_kv(user_id,key) on delete cascade
);$up_ca4978367edfe0e3b219eb88$;
-- supabase/sql/proposals/career_applicant_resume_store_v1.sql statement 2
EXECUTE $up_6d9c927fbba17878055aa33b$
create index career_applicant_resume_latest_v1 on public.career_applicant_resumes_v1(user_id,privacy_epoch,sequence desc);$up_6d9c927fbba17878055aa33b$;
-- supabase/sql/proposals/career_applicant_resume_store_v1.sql statement 3
EXECUTE $up_13c1033049a6cecf6d6bb2f6$
alter table public.career_applicant_resumes_v1 enable row level security;$up_13c1033049a6cecf6d6bb2f6$;
-- supabase/sql/proposals/career_applicant_resume_store_v1.sql statement 4
EXECUTE $up_f6f7c224d0493e3f084fc06d$
revoke all on public.career_applicant_resumes_v1 from public,anon,authenticated;$up_f6f7c224d0493e3f084fc06d$;
-- supabase/sql/proposals/career_applicant_resume_store_v1.sql statement 5
EXECUTE $up_adc8be4f47e9e929691550ed$
grant select,insert,delete on public.career_applicant_resumes_v1 to service_role;$up_adc8be4f47e9e929691550ed$;
-- supabase/sql/proposals/career_applicant_resume_store_v1.sql statement 6
EXECUTE $up_5b56bf7227ed3ef6ff440a24$
grant usage,select on sequence public.career_applicant_resumes_v1_sequence_seq to service_role;$up_5b56bf7227ed3ef6ff440a24$;
-- supabase/sql/proposals/career_applicant_resume_store_v1.sql statement 7
EXECUTE $up_55a2dbc025bf12d8f8d70a42$
create policy career_applicant_resume_backend_v1 on public.career_applicant_resumes_v1 for all to service_role using(true) with check(true);$up_55a2dbc025bf12d8f8d70a42$;
-- supabase/sql/proposals/career_applicant_resume_store_v1.sql statement 8
EXECUTE $up_e4fe475748ea85a20bfc584d$

-- Stamp new durable turn receipts from the existing account row. Timestamps
-- are not an authority/version proof (several writes can share a transaction).
-- Legacy receipts are never retrospectively upgraded to explicit confirmation.
create function public.career_applicant_turn_version_v1() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
declare a jsonb;
begin
 if new.key like 'career:turn:%' then
  if new.value->'response' is null or new.value->'response'='null'::jsonb then new.value:=new.value-'equipment_account_version';
  else
   select value into a from career_watch_kv where user_id=new.user_id and key='career:account';
   new.value:=(new.value-'equipment_account_version')||jsonb_build_object('equipment_account_version',(a->>'version')::bigint);
  end if;
 end if;
 return new;
end $$;$up_e4fe475748ea85a20bfc584d$;
-- supabase/sql/proposals/career_applicant_resume_store_v1.sql statement 9
EXECUTE $up_9d2f1955bdf84499c11b1a55$
create trigger career_applicant_turn_version_stamp_v1 before insert or update on public.career_watch_kv for each row execute function public.career_applicant_turn_version_v1();$up_9d2f1955bdf84499c11b1a55$;
-- supabase/sql/proposals/career_applicant_resume_store_v1.sql statement 10
EXECUTE $up_d8da3546bdb9094c7885f5d1$

-- Called ONLY by a server-owned upload/confirmation handler after a genuine
-- authenticated plain-text turn commits. No such upload handler exists yet.
-- Source provenance is the exact existing careerRequestHash v2 + owned turn
-- receipt, not a caller's boolean or inferred status on a resume fact.
create function public.career_applicant_resume_confirm_v1(p_user uuid,p_thread uuid,p_key text,p_artifact text,p_version text,p_filename text,p_type text,p_encoded text)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare a jsonb;r jsonb;f jsonb;b bytea;sha text;message text;expected text;old career_applicant_resumes_v1;
begin
 if p_user is null or p_thread is null or coalesce(p_key,'') !~ '^[A-Za-z0-9_-]{1,128}$' or coalesce(p_artifact,'') !~ '^[A-Za-z0-9_-]{1,160}$' or coalesce(p_version,'') !~ '^[A-Za-z0-9_-]{1,160}$' or p_encoded is null or length(p_encoded)>1398104 or p_encoded !~ '^[A-Za-z0-9+/]+={0,2}$' then raise exception 'invalid applicant resume';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select value into a from career_watch_kv where user_id=p_user and key='career:account';
 if a is null or a->'paused'='true'::jsonb then raise exception 'applicant authority revoked';end if;
 if not exists(select 1 from agent_threads where id=p_thread and user_id=p_user) then raise exception 'owned applicant thread missing';end if;
 select state->'career' into f from agent_flow_state where thread_id=p_thread and user_id=p_user;
 if f#>>'{scope,userId}' is distinct from p_user::text or coalesce((f->>'privacy_epoch')::bigint,-1) is distinct from coalesce((a->>'epoch')::bigint,0) then raise exception 'applicant snapshot stale';end if;
 b:=decode(p_encoded,'base64');sha:=encode(sha256(b),'hex');
 if octet_length(b) not between 1 and 1048576 or replace(encode(b,'base64'),E'\n','') is distinct from p_encoded then raise exception 'invalid applicant resume bytes';end if;
 if not ((p_type='application/pdf' and substring(b from 1 for 5)=convert_to('%PDF-','UTF8') and p_filename ~* '\.pdf$') or (p_type='application/vnd.openxmlformats-officedocument.wordprocessingml.document' and substring(b from 1 for 4)=decode('504b0304','hex') and p_filename ~* '\.docx$')) then raise exception 'invalid applicant resume type';end if;
 message:='Confirm resume '||sha||' for applications';
 expected:=encode(sha256(convert_to('{"acceptedImages":[],"careerTask":null,"message":'||to_json(message)::text||',"version":"career_turn/v2"}','UTF8')),'hex');
 select value into r from career_watch_kv where user_id=p_user and key='career:turn:'||p_thread||':'||p_key;
 if r is null or r->>'hash' is distinct from expected or r->'response' is null or r->'response'='null'::jsonb or r#>>'{response,thread_id}' is distinct from p_thread::text or coalesce((r->>'epoch')::bigint,-1) is distinct from coalesce((a->>'epoch')::bigint,0) then raise exception 'explicit owned resume confirmation required';end if;
 select * into old from career_applicant_resumes_v1 where user_id=p_user and artifact_id=p_artifact and version_id=p_version;
 if old.artifact_id is not null then
  if old.confirmation_account_version is distinct from (r->>'equipment_account_version')::bigint or old.sha256 is distinct from sha or old.filename is distinct from p_filename or old.content_type is distinct from p_type or old.confirmation_key is distinct from 'career:turn:'||p_thread||':'||p_key then raise exception 'immutable applicant resume conflict';end if;
  return jsonb_build_object('artifactId',old.artifact_id,'versionId',old.version_id,'sha256',old.sha256,'replay',true);
 end if;
 -- An old confirmed chat turn cannot become a newer artifact after another
 -- turn advanced the existing account row. Serialize on the same owner lock.
 if (r->>'equipment_account_version')::bigint is distinct from (a->>'version')::bigint then raise exception 'applicant confirmation stale';end if;
 insert into career_applicant_resumes_v1(user_id,artifact_id,version_id,privacy_epoch,filename,content_type,content,confirmation_thread,confirmation_account_version,confirmation_key,confirmation_ref)
 values(p_user,p_artifact,p_version,coalesce((a->>'epoch')::bigint,0),p_filename,p_type,b,p_thread,(a->>'version')::bigint,'career:turn:'||p_thread||':'||p_key,p_key);
 return jsonb_build_object('artifactId',p_artifact,'versionId',p_version,'sha256',sha,'replay',false);
end $$;$up_d8da3546bdb9094c7885f5d1$;
-- supabase/sql/proposals/career_applicant_resume_store_v1.sql statement 11
EXECUTE $up_31fed7bd08bd576b01175fd1$

-- This is a task/lease scoped read, never an arbitrary owner/profile dump.
-- The original prepare request anchors artifact/hash/posting; approve still
-- needs its own existing exact approval intent. It starts no browser action.
create function public.career_applicant_equipment_resolve_v1(p_user uuid,p_artifact text,p_version bigint,p_epoch bigint,p_task text,p_intent text,p_lease uuid,p_posting text,p_sha text,p_include_bytes boolean default false)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare a jsonb;i career_task_intents_v1;latest career_applicant_resumes_v1;record jsonb;confirmation jsonb;r jsonb;
begin
 if p_user is null or p_version is null or p_epoch is null or p_lease is null or p_include_bytes is null or coalesce(p_task,'') !~ '^[a-f0-9]{32}$' or coalesce(p_intent,'') !~ '^[a-f0-9]{64}$' or coalesce(p_sha,'') !~ '^[a-f0-9]{64}$' then raise exception 'applicant scope required';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select value into a from career_watch_kv where user_id=p_user and key='career:account';
 select * into i from career_task_intents_v1 where user_id=p_user and intent_id=p_intent;
 if a is null or a->'paused'='true'::jsonb or (a->>'version')::bigint is distinct from p_version or coalesce((a->>'epoch')::bigint,0) is distinct from p_epoch or i.intent_id is null or i.state<>'claimed' or i.task_id is distinct from p_task or i.lease_token is distinct from p_lease or i.expires_at<=clock_timestamp() or i.authority_account_version is distinct from p_version or i.privacy_epoch is distinct from p_epoch or coalesce(i.binding->>'action','') not in ('prepare','approve') or i.binding->>'resume_sha256' is distinct from p_sha or (i.claim_worker is not null and (i.claim_lease_until is null or i.claim_lease_until<=clock_timestamp())) then raise exception 'applicant task authority revoked';end if;
 if not exists(select 1 from career_task_intents_v1 anchor where anchor.user_id=p_user and anchor.task_id=p_task and anchor.privacy_epoch=p_epoch and anchor.binding->>'action'='prepare' and anchor.binding->>'artifact_id'=p_artifact and anchor.binding->>'resume_sha256'=p_sha and anchor.private_input#>>'{posting,canonicalKey}'=p_posting) then raise exception 'applicant posting binding mismatch';end if;
 select * into latest from career_applicant_resumes_v1 where user_id=p_user and privacy_epoch=p_epoch order by sequence desc limit 1;
 if latest.artifact_id is null then return jsonb_build_object('error','CONFIRMED_RESUME_NOT_STORED');end if;
 if latest.artifact_id is distinct from p_artifact or latest.sha256 is distinct from p_sha then raise exception 'latest confirmed applicant resume required';end if;
 select value into r from career_watch_kv where user_id=p_user and key=latest.confirmation_key;
 if r is null or r->'response' is null or r->'response'='null'::jsonb or coalesce((r->>'epoch')::bigint,-1) is distinct from p_epoch or (r->>'equipment_account_version')::bigint is distinct from latest.confirmation_account_version or not exists(select 1 from agent_threads where id=latest.confirmation_thread and user_id=p_user) then raise exception 'applicant confirmation revoked';end if;
 confirmation:=jsonb_build_object('confirmed',true,'userId',p_user,'ref',latest.confirmation_ref,'at',latest.confirmed_at);
 record:=jsonb_build_object('version','career_owned_equipment/v2','userId',p_user,'accountVersion',p_version,'privacyEpoch',p_epoch,
 'artifact',jsonb_build_object('id',latest.artifact_id,'versionId',latest.version_id,'userId',p_user,'privacyEpoch',p_epoch,'filename',latest.filename,'contentType',latest.content_type,'bytes',octet_length(latest.content),'sha256',latest.sha256,'confirmation',confirmation),
 'latestConfirmedArtifact',jsonb_build_object('userId',p_user,'privacyEpoch',p_epoch,'id',latest.artifact_id,'versionId',latest.version_id,'sha256',latest.sha256,'confirmationRef',latest.confirmation_ref),
 'facts','[]'::jsonb);
 return jsonb_build_object('records',record)||case when p_include_bytes then jsonb_build_object('blob',jsonb_build_object('userId',p_user,'artifactId',latest.artifact_id,'versionId',latest.version_id,'base64',replace(encode(latest.content,'base64'),E'\n',''))) else '{}'::jsonb end;
end $$;$up_31fed7bd08bd576b01175fd1$;
-- supabase/sql/proposals/career_applicant_resume_store_v1.sql statement 12
EXECUTE $up_9b4c2239b0ae5ad9e4fffc26$

create function public.career_applicant_resume_erase_v1() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if coalesce(new.key,old.key)='career:account' and (tg_op='DELETE' or (tg_op='UPDATE' and coalesce((new.value->>'epoch')::bigint,0) is distinct from coalesce((old.value->>'epoch')::bigint,0))) then
  delete from career_applicant_resumes_v1 where user_id=coalesce(new.user_id,old.user_id);
 end if;
 return null;
end $$;$up_9b4c2239b0ae5ad9e4fffc26$;
-- supabase/sql/proposals/career_applicant_resume_store_v1.sql statement 13
EXECUTE $up_685a4987607f5fc62e0a25aa$
create trigger career_applicant_resume_erasure_v1 after update or delete on public.career_watch_kv for each row execute function public.career_applicant_resume_erase_v1();$up_685a4987607f5fc62e0a25aa$;
-- supabase/sql/proposals/career_applicant_resume_store_v1.sql statement 14
EXECUTE $up_2da3df4e9c29e19d1944c50b$
revoke all on function public.career_applicant_resume_confirm_v1(uuid,uuid,text,text,text,text,text,text),public.career_applicant_equipment_resolve_v1(uuid,text,bigint,bigint,text,text,uuid,text,text,boolean),public.career_applicant_resume_erase_v1(),public.career_applicant_turn_version_v1() from public,anon,authenticated;$up_2da3df4e9c29e19d1944c50b$;
-- supabase/sql/proposals/career_applicant_resume_store_v1.sql statement 15
EXECUTE $up_877851aa644db648ba5ab9c2$
grant execute on function public.career_applicant_resume_confirm_v1(uuid,uuid,text,text,text,text,text,text),public.career_applicant_equipment_resolve_v1(uuid,text,bigint,bigint,text,text,uuid,text,text,boolean),public.career_applicant_resume_erase_v1(),public.career_applicant_turn_version_v1() to service_role;$up_877851aa644db648ba5ab9c2$;
-- supabase/sql/proposals/career_applicant_ingress_v1.sql statement 1
EXECUTE $up_be94a23f747491122d72e411$-- UNAPPLIED forward proposal after career_applicant_resume_store_v1.sql.
-- Standalone authenticated applicant ingress; no agent-chat/native edits.
create function public.career_applicant_canonical_v1(v jsonb) returns text language sql immutable security invoker set search_path=public,pg_temp as $$
 select case jsonb_typeof(v)
 when 'object' then '{'||coalesce((select string_agg(to_json(key)::text||':'||career_applicant_canonical_v1(value),',' order by key collate "C") from jsonb_each(v)),'')||'}'
 when 'array' then '['||coalesce((select string_agg(career_applicant_canonical_v1(value),',' order by ord) from jsonb_array_elements(v) with ordinality x(value,ord)),'')||']'
 else v::text end;
$$;$up_be94a23f747491122d72e411$;
-- supabase/sql/proposals/career_applicant_ingress_v1.sql statement 2
EXECUTE $up_de80dffbf073bdf15e6b1a65$
create table public.career_applicant_uploads_v1(
 user_id uuid not null references auth.users(id) on delete cascade,
 upload_id uuid not null,artifact_id text not null,thread_id uuid not null references agent_threads(id),request_key text not null,
 privacy_epoch bigint not null,filename text not null,content_type text not null,sha256 text not null,bytes integer not null,
 content bytea,validation jsonb not null,review jsonb,confirmed boolean not null default false,
 created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '15 minutes',
 primary key(user_id,upload_id),unique(user_id,request_key),
 check(bytes between 1 and 1048576),check(content is null or octet_length(content)=bytes),
 check(sha256 ~ '^[a-f0-9]{64}$'),check(filename !~ '[[:cntrl:]/\\]' and length(filename) between 1 and 180),
 check(content_type in ('application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document'))
);$up_de80dffbf073bdf15e6b1a65$;
-- supabase/sql/proposals/career_applicant_ingress_v1.sql statement 3
EXECUTE $up_87cdd8c3ed031e44448ca2ca$
create index career_applicant_upload_expiry_v1 on career_applicant_uploads_v1(expires_at) where not confirmed;$up_87cdd8c3ed031e44448ca2ca$;
-- supabase/sql/proposals/career_applicant_ingress_v1.sql statement 4
EXECUTE $up_c5d97d10473f03f2077d36d7$
alter table career_applicant_uploads_v1 enable row level security;$up_c5d97d10473f03f2077d36d7$;
-- supabase/sql/proposals/career_applicant_ingress_v1.sql statement 5
EXECUTE $up_fa7c02f7a84f2fa3104d96d7$
revoke all on career_applicant_uploads_v1 from public,anon,authenticated;$up_fa7c02f7a84f2fa3104d96d7$;
-- supabase/sql/proposals/career_applicant_ingress_v1.sql statement 6
EXECUTE $up_18dc018a43fb43095fba088b$
grant select,insert,update,delete on career_applicant_uploads_v1 to service_role;$up_18dc018a43fb43095fba088b$;
-- supabase/sql/proposals/career_applicant_ingress_v1.sql statement 7
EXECUTE $up_47ad34f5f8342edb3b1883e2$
create policy career_applicant_upload_backend_v1 on career_applicant_uploads_v1 for all to service_role using(true) with check(true);$up_47ad34f5f8342edb3b1883e2$;
-- supabase/sql/proposals/career_applicant_ingress_v1.sql statement 8
EXECUTE $up_a09d522930ee22817aca62e2$
alter table career_applicant_resumes_v1 add column upload_id uuid,add column confirmed_fields jsonb not null default '[]'::jsonb,
 add foreign key(user_id,upload_id) references career_applicant_uploads_v1(user_id,upload_id) on delete cascade;$up_a09d522930ee22817aca62e2$;
-- supabase/sql/proposals/career_applicant_ingress_v1.sql statement 9
EXECUTE $up_c319eed2a675ec308429119b$

create function public.career_applicant_upload_sweep_v1(p_user uuid,p_limit integer default 20) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare n integer;
begin
 if p_user is null or p_limit is null or p_limit not between 1 and 100 then raise exception 'invalid upload cleanup scope';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 with expired as(select upload_id from career_applicant_uploads_v1 where user_id=p_user and not confirmed and expires_at<=clock_timestamp() order by expires_at limit p_limit)
 delete from career_applicant_uploads_v1 u using expired e where u.user_id=p_user and u.upload_id=e.upload_id;
 get diagnostics n=row_count;return jsonb_build_object('deleted',n);
end $$;$up_c319eed2a675ec308429119b$;
-- supabase/sql/proposals/career_applicant_ingress_v1.sql statement 10
EXECUTE $up_79dec4271db604199d943634$

create function public.career_applicant_upload_turn_v1(p_base jsonb,p_upload jsonb,p_encoded text) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare u uuid:=(p_base->>'p_user')::uuid;t uuid:=(p_base->>'p_thread')::uuid;a jsonb;f jsonb;b bytea;meta jsonb;expected text;reply jsonb;saved jsonb;old career_applicant_uploads_v1;
begin
 if u is null or t is null or coalesce(p_base->>'p_key','') !~ '^[A-Za-z0-9_-]{1,128}$' or p_encoded is null or length(p_encoded)>1398104 then raise exception 'invalid upload request';end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 perform career_applicant_upload_sweep_v1(u);
 if not exists(select 1 from agent_threads where id=t and user_id=u) then raise exception 'owned applicant thread missing';end if;
 select value into a from career_watch_kv where user_id=u and key='career:account';a:=coalesce(a,'{"version":0,"epoch":0}'::jsonb);
 if a->'paused'='true'::jsonb then raise exception 'applicant authority revoked';end if;
 b:=decode(p_encoded,'base64');
 if octet_length(b) not between 1 and 1048576 or replace(encode(b,'base64'),E'\n','') is distinct from p_encoded or p_upload->>'sha256' is distinct from encode(sha256(b),'hex') or (p_upload->>'bytes')::integer is distinct from octet_length(b) or p_upload->>'policy' is distinct from 'bounded_plain_pdf_docx/v1' or p_upload->>'version' is distinct from 'career_applicant_format/v1' then raise exception 'invalid upload bytes';end if;
 if not ((p_upload->>'contentType'='application/pdf' and substring(b from 1 for 5)=convert_to('%PDF-','UTF8') and p_upload->>'filename' ~* '\.pdf$') or (p_upload->>'contentType'='application/vnd.openxmlformats-officedocument.wordprocessingml.document' and substring(b from 1 for 4)=decode('504b0304','hex') and p_upload->>'filename' ~* '\.docx$')) then raise exception 'invalid upload type';end if;
 meta:=jsonb_build_object('version','career_applicant_upload/v1','threadId',t,'requestId',p_base->>'p_key','filename',p_upload->>'filename','contentType',p_upload->>'contentType','sha256',p_upload->>'sha256','bytes',octet_length(b));
 expected:=encode(sha256(convert_to(career_applicant_canonical_v1(meta),'UTF8')),'hex');
 if p_base->>'p_hash' is distinct from expected then raise exception 'upload request hash mismatch';end if;
 select * into old from career_applicant_uploads_v1 where user_id=u and request_key=p_base->>'p_key';
 if old.upload_id is not null then
  if old.sha256 is distinct from p_upload->>'sha256' or old.filename is distinct from p_upload->>'filename' or old.content_type is distinct from p_upload->>'contentType' or old.thread_id is distinct from t then raise exception 'upload idempotency conflict';end if;
  return jsonb_build_object('response',(select value->'response' from career_watch_kv where user_id=u and key='career:turn:'||t||':'||(p_base->>'p_key')),'replay',true);
 end if;
 if (select count(*) from career_applicant_uploads_v1 where user_id=u and not confirmed)>=4 then raise exception 'unconfirmed upload limit';end if;
 select state->'career' into f from agent_flow_state where thread_id=t and user_id=u;
 f:=coalesce(f,jsonb_build_object('v',1,'scope',jsonb_build_object('userId',u),'stores','{}'::jsonb));
 old.upload_id:=gen_random_uuid();old.artifact_id:='resume_'||replace(old.upload_id::text,'-','');
 reply:=jsonb_build_object('thread_id',t,'turn_key',p_base->>'p_key','reply','Resume uploaded privately. Review this owned file before confirming it; nothing was submitted.','reminders','[]'::jsonb,'applicant',jsonb_build_object('status','uploaded_unconfirmed','uploadId',old.upload_id,'artifactId',old.artifact_id,'sha256',p_upload->>'sha256','filename',p_upload->>'filename','contentType',p_upload->>'contentType','bytes',octet_length(b),'expiresAt',now()+interval '15 minutes'));
 saved:=career_host_commit(u,t,p_base->>'p_key',expected,(p_base->>'p_revision')::bigint,(p_base->>'p_account_version')::bigint,f,'{}'::jsonb,'Upload resume '||(p_upload->>'filename'),reply);
 if saved ? 'error' then return saved;end if;
 if saved->'replay'='true'::jsonb then raise exception 'upload record unavailable';end if;
 select value into a from career_watch_kv where user_id=u and key='career:account';
 insert into career_applicant_uploads_v1(user_id,upload_id,artifact_id,thread_id,request_key,privacy_epoch,filename,content_type,sha256,bytes,content,validation)
 values(u,old.upload_id,old.artifact_id,t,p_base->>'p_key',coalesce((a->>'epoch')::bigint,0),p_upload->>'filename',p_upload->>'contentType',p_upload->>'sha256',octet_length(b),b,p_upload);
 return saved;
end $$;$up_79dec4271db604199d943634$;
-- supabase/sql/proposals/career_applicant_ingress_v1.sql statement 11
EXECUTE $up_cde0885c50e69e8f19ee463e$

create function public.career_applicant_review_v1(p_user uuid,p_thread uuid,p_upload uuid,p_fields jsonb) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare a jsonb;v career_applicant_uploads_v1;k text;x jsonb;binding jsonb;h text;
begin
 if p_user is null or p_thread is null or p_upload is null or jsonb_typeof(p_fields) is distinct from 'object' or octet_length(p_fields::text)>8000 then raise exception 'invalid applicant review';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));perform career_applicant_upload_sweep_v1(p_user);
 select value into a from career_watch_kv where user_id=p_user and key='career:account';
 select * into v from career_applicant_uploads_v1 where user_id=p_user and upload_id=p_upload for update;
 if a is null or a->'paused'='true'::jsonb or v.upload_id is null or v.privacy_epoch is distinct from coalesce((a->>'epoch')::bigint,0) or (not v.confirmed and v.expires_at<=clock_timestamp()) or not exists(select 1 from agent_threads where id=p_thread and user_id=p_user) then raise exception 'owned upload unavailable';end if;
 for k,x in select * from jsonb_each(p_fields) loop
  if k not in ('name','first_name','last_name','email','phone','location','country','city','state','postal_code','linkedin','website','github') or jsonb_typeof(x) is distinct from 'string' or length(x#>>'{}') not between 1 and 300 or (x#>>'{}') ~ '[[:cntrl:]]' or btrim(x#>>'{}')='' then raise exception 'unsupported explicit applicant field';end if;
 end loop;
 binding:=jsonb_build_object('version','career_applicant_review/v1','userId',p_user,'threadId',p_thread,'uploadId',p_upload,'artifactId',v.artifact_id,'filename',v.filename,'contentType',v.content_type,'sha256',v.sha256,'bytes',v.bytes,'accountVersion',(a->>'version')::bigint,'privacyEpoch',coalesce((a->>'epoch')::bigint,0),'fields',p_fields);
 h:=encode(sha256(convert_to(career_applicant_canonical_v1(binding),'UTF8')),'hex');
 if v.review->>'sha256' is distinct from h or (v.review->>'expiresAt')::timestamptz<=clock_timestamp() then
  update career_applicant_uploads_v1 set review=jsonb_build_object('sha256',h,'binding',binding,'expiresAt',now()+interval '10 minutes') where user_id=p_user and upload_id=p_upload returning * into v;
 end if;
 return jsonb_build_object('review',v.review,'confirmationMessage',case when p_fields='{}'::jsonb then 'use this resume' else 'use this resume and confirm these fields' end);
end $$;$up_cde0885c50e69e8f19ee463e$;
-- supabase/sql/proposals/career_applicant_ingress_v1.sql statement 12
EXECUTE $up_791cbb40ab5d4a91f6b7fce2$

create function public.career_applicant_confirm_turn_v1(p_base jsonb,p_upload uuid,p_review text,p_fields jsonb,p_message text) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare u uuid:=(p_base->>'p_user')::uuid;t uuid:=(p_base->>'p_thread')::uuid;a jsonb;v career_applicant_uploads_v1;f jsonb;profile jsonb;k text;x jsonb;source_path text[];fields jsonb:='[]'::jsonb;binding jsonb;expected text;reply jsonb;saved jsonb;b bytea;version_id text;r jsonb;
begin
 if u is null or t is null or p_upload is null or coalesce(p_review,'') !~ '^[a-f0-9]{64}$' or p_message is null or length(p_message)>120 or jsonb_typeof(p_fields) is distinct from 'object' or lower(btrim(p_message)) is distinct from (case when p_fields='{}'::jsonb then 'use this resume' else 'use this resume and confirm these fields' end) then raise exception 'explicit owned upload confirmation required';end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 binding:=jsonb_build_object('version','career_applicant_confirm/v1','threadId',t,'requestId',p_base->>'p_key','uploadId',p_upload,'reviewHash',p_review,'fields',p_fields,'message',p_message);
 expected:=encode(sha256(convert_to(career_applicant_canonical_v1(binding),'UTF8')),'hex');
 if p_base->>'p_hash' is distinct from expected then raise exception 'confirmation request hash mismatch';end if;
 select value into r from career_watch_kv where user_id=u and key='career:turn:'||t||':'||(p_base->>'p_key');
 select value into a from career_watch_kv where user_id=u and key='career:account';
 if r is not null then
  if r->>'hash' is distinct from expected or r->'response' is null or r->'response'='null'::jsonb or coalesce((r->>'epoch')::bigint,-1) is distinct from coalesce((a->>'epoch')::bigint,0) then raise exception 'confirmation replay conflict';end if;
  return jsonb_build_object('response',r->'response','replay',true);
 end if;
 if a is null or a->'paused'='true'::jsonb or not exists(select 1 from agent_threads where id=t and user_id=u) then raise exception 'applicant authority revoked';end if;
 select * into v from career_applicant_uploads_v1 where user_id=u and upload_id=p_upload for update;
 if v.upload_id is null or v.privacy_epoch is distinct from coalesce((a->>'epoch')::bigint,0) or (not v.confirmed and v.expires_at<=clock_timestamp()) or v.review is null or v.review->>'sha256' is distinct from p_review or (v.review->>'expiresAt')::timestamptz<=clock_timestamp() or v.review#>>'{binding,threadId}' is distinct from t::text or v.review#>'{binding,fields}' is distinct from p_fields or (v.review#>>'{binding,accountVersion}')::bigint is distinct from (a->>'version')::bigint then raise exception 'applicant review stale or missing';end if;
 b:=v.content;if b is null then select content into b from career_applicant_resumes_v1 where user_id=u and upload_id=p_upload order by sequence desc limit 1;end if;
 if b is null or encode(sha256(b),'hex') is distinct from v.sha256 then raise exception 'owned upload bytes unavailable';end if;
 select state->'career' into f from agent_flow_state where thread_id=t and user_id=u;
 f:=coalesce(f,jsonb_build_object('v',1,'scope',jsonb_build_object('userId',u),'stores','{}'::jsonb));
 profile:=coalesce(f#>'{stores,profile}',p_base->'p_profile_defaults');
 if jsonb_typeof(profile) is distinct from 'object' or jsonb_typeof(profile->'basics') is distinct from 'object' then raise exception 'server profile defaults required';end if;
 profile:=jsonb_set(profile,'{basics}',coalesce(profile->'basics','{}'::jsonb));profile:=jsonb_set(profile,'{basics,links}',coalesce(profile#>'{basics,links}','{}'::jsonb));
 for k,x in select * from jsonb_each(p_fields) loop
  source_path:=case when k in ('linkedin','website','github') then array['basics','links',k] else array['basics',k] end;
  profile:=jsonb_set(profile,source_path,x);
  fields:=fields||jsonb_build_array(jsonb_build_object('kind','fact','key',k,'value',x,'userId',u,'privacyEpoch',coalesce((a->>'epoch')::bigint,0),'confirmation',jsonb_build_object('confirmed',true,'userId',u,'ref',p_base->>'p_key','at',now()),'source',jsonb_build_object('kind','authenticated_applicant_turn/v1','threadId',t,'turnKey',p_base->>'p_key','requestHash',expected,'uploadId',p_upload,'reviewHash',p_review,'path',source_path)));
 end loop;
 f:=jsonb_set(f,'{stores,profile}',profile);version_id:='confirmed_'||substr(expected,1,40);
 reply:=jsonb_build_object('thread_id',t,'turn_key',p_base->>'p_key','reply','Saved this owned resume and the fields you explicitly confirmed. Each application still needs its own review and approval.','reminders','[]'::jsonb,'applicant',jsonb_build_object('status','confirmed','uploadId',p_upload,'artifactId',v.artifact_id,'versionId',version_id,'sha256',v.sha256,'filename',v.filename,'contentType',v.content_type,'bytes',v.bytes,'confirmedFieldKeys',(select coalesce(jsonb_agg(key order by key),'[]'::jsonb) from jsonb_each(p_fields))));
 saved:=career_host_commit(u,t,p_base->>'p_key',expected,(p_base->>'p_revision')::bigint,(p_base->>'p_account_version')::bigint,f,'{}'::jsonb,p_message,reply);
 if saved ? 'error' then return saved;end if;
 select value into a from career_watch_kv where user_id=u and key='career:account';
 if (select count(*) from career_applicant_resumes_v1 where user_id=u)>=20 then raise exception 'confirmed resume history limit';end if;
 insert into career_applicant_resumes_v1(user_id,artifact_id,version_id,privacy_epoch,filename,content_type,content,confirmation_thread,confirmation_account_version,confirmation_key,confirmation_ref,upload_id,confirmed_fields)
 values(u,v.artifact_id,version_id,coalesce((a->>'epoch')::bigint,0),v.filename,v.content_type,b,t,(a->>'version')::bigint,'career:turn:'||t||':'||(p_base->>'p_key'),p_base->>'p_key',p_upload,fields);
 update career_applicant_uploads_v1 set content=null,review=null,confirmed=true where user_id=u and upload_id=p_upload;
 return saved;
end $$;$up_791cbb40ab5d4a91f6b7fce2$;
-- supabase/sql/proposals/career_applicant_ingress_v1.sql statement 13
EXECUTE $up_dafb42304b8300572fbaa94c$

alter function public.career_applicant_equipment_resolve_v1(uuid,text,bigint,bigint,text,text,uuid,text,text,boolean) rename to career_applicant_equipment_resolve_base_v1;$up_dafb42304b8300572fbaa94c$;
-- supabase/sql/proposals/career_applicant_ingress_v1.sql statement 14
EXECUTE $up_80f01e084a21e29857fdf046$
create function public.career_applicant_equipment_resolve_v1(p_user uuid,p_artifact text,p_version bigint,p_epoch bigint,p_task text,p_intent text,p_lease uuid,p_posting text,p_sha text,p_include_bytes boolean default false)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare result jsonb;v career_applicant_resumes_v1;f jsonb;x jsonb;facts jsonb:='[]'::jsonb;source_path text[];
begin
 result:=career_applicant_equipment_resolve_base_v1(p_user,p_artifact,p_version,p_epoch,p_task,p_intent,p_lease,p_posting,p_sha,p_include_bytes);
 if result ? 'error' then return result;end if;
 select * into v from career_applicant_resumes_v1 where user_id=p_user and artifact_id=p_artifact and version_id=result#>>'{records,artifact,versionId}';
 select state->'career' into f from agent_flow_state where user_id=p_user and thread_id=v.confirmation_thread;
 if f#>>'{scope,userId}'=p_user::text and coalesce((f->>'privacy_epoch')::bigint,-1)=p_epoch and exists(select 1 from career_task_intents_v1 where user_id=p_user and intent_id=p_intent and thread_id=v.confirmation_thread) then
  for x in select * from jsonb_array_elements(v.confirmed_fields) loop
   select array_agg(value order by ord) into source_path from jsonb_array_elements_text(x#>'{source,path}') with ordinality a(value,ord);
   if x->>'userId'=p_user::text and (x->>'privacyEpoch')::bigint=p_epoch and f#>'{stores,profile}'#>source_path=x->'value' then facts:=facts||jsonb_build_array(x);end if;
  end loop;
 end if;
 return jsonb_set(result,'{records,facts}',facts);
end $$;$up_80f01e084a21e29857fdf046$;
-- supabase/sql/proposals/career_applicant_ingress_v1.sql statement 15
EXECUTE $up_adb898bf1d88a30053c0d0c1$
create function public.career_applicant_upload_erase_v1() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if coalesce(new.key,old.key)='career:account' and (tg_op='DELETE' or (tg_op='UPDATE' and coalesce((new.value->>'epoch')::bigint,0) is distinct from coalesce((old.value->>'epoch')::bigint,0))) then delete from career_applicant_uploads_v1 where user_id=coalesce(new.user_id,old.user_id);end if;
 return null;
end $$;$up_adb898bf1d88a30053c0d0c1$;
-- supabase/sql/proposals/career_applicant_ingress_v1.sql statement 16
EXECUTE $up_a3fc0998776f364970645997$
create trigger career_applicant_upload_erasure_v1 after update or delete on career_watch_kv for each row execute function career_applicant_upload_erase_v1();$up_a3fc0998776f364970645997$;
-- supabase/sql/proposals/career_applicant_ingress_v1.sql statement 17
EXECUTE $up_1ba0f9941b038fc96b789adb$
revoke all on function career_applicant_canonical_v1(jsonb),career_applicant_upload_sweep_v1(uuid,integer),career_applicant_upload_turn_v1(jsonb,jsonb,text),career_applicant_review_v1(uuid,uuid,uuid,jsonb),career_applicant_confirm_turn_v1(jsonb,uuid,text,jsonb,text),career_applicant_equipment_resolve_v1(uuid,text,bigint,bigint,text,text,uuid,text,text,boolean),career_applicant_upload_erase_v1() from public,anon,authenticated;$up_1ba0f9941b038fc96b789adb$;
-- supabase/sql/proposals/career_applicant_ingress_v1.sql statement 18
EXECUTE $up_70f8aa5b3df2ce85586a6315$
grant execute on function career_applicant_canonical_v1(jsonb),career_applicant_upload_sweep_v1(uuid,integer),career_applicant_upload_turn_v1(jsonb,jsonb,text),career_applicant_review_v1(uuid,uuid,uuid,jsonb),career_applicant_confirm_turn_v1(jsonb,uuid,text,jsonb,text),career_applicant_equipment_resolve_v1(uuid,text,bigint,bigint,text,text,uuid,text,text,boolean),career_applicant_upload_erase_v1() to service_role;$up_70f8aa5b3df2ce85586a6315$;
-- supabase/sql/proposals/career_applicant_ingress_v1.sql statement 19
EXECUTE $up_05a3af52538a265a57f0ac2d$

-- Read-only reload discovery. Global same-epoch resume metadata is available
-- in any owned thread; source-thread contact facts and original bytes are not.
-- The existing account and immutable confirmation receipt remain authority.
create function public.career_applicant_status_v1(p_user uuid,p_thread uuid) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare a jsonb;r jsonb;latest career_applicant_resumes_v1;result jsonb;epoch bigint;
begin
 if p_user is null or p_thread is null then return jsonb_build_object('error','APPLICANT_STATUS_FORBIDDEN');end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 if not exists(select 1 from agent_threads where id=p_thread and user_id=p_user)then return jsonb_build_object('error','APPLICANT_STATUS_FORBIDDEN');end if;
 select value into a from career_watch_kv where user_id=p_user and key='career:account';
 if a is null or a->'paused'='true'::jsonb then return jsonb_build_object('error','APPLICANT_STATUS_REVOKED');end if;
 epoch:=coalesce((a->>'epoch')::bigint,0);
 result:=jsonb_build_object('version','career_applicant_status/v1','userId',p_user,'threadId',p_thread,'accountVersion',(a->>'version')::bigint,'privacyEpoch',epoch,'checkedAt',clock_timestamp());
 select * into latest from career_applicant_resumes_v1 where user_id=p_user and privacy_epoch=epoch order by sequence desc limit 1;
 if latest.artifact_id is null then return result||jsonb_build_object('status','none','applicant',null);end if;
 select value into r from career_watch_kv where user_id=p_user and key=latest.confirmation_key;
 if r is null or r->'response' is null or r->'response'='null'::jsonb or r#>>'{response,thread_id}' is distinct from latest.confirmation_thread::text or coalesce((r->>'epoch')::bigint,-1) is distinct from epoch or (r->>'equipment_account_version')::bigint is distinct from latest.confirmation_account_version or not exists(select 1 from agent_threads where id=latest.confirmation_thread and user_id=p_user)then return jsonb_build_object('error','APPLICANT_CONFIRMATION_UNAVAILABLE');end if;
 return result||jsonb_build_object('status','confirmed','applicant',jsonb_build_object('status','confirmed','artifactId',latest.artifact_id,'versionId',latest.version_id,'sha256',latest.sha256,'filename',latest.filename,'contentType',latest.content_type,'bytes',octet_length(latest.content),'confirmedAt',latest.confirmed_at));
end $$;$up_05a3af52538a265a57f0ac2d$;
-- supabase/sql/proposals/career_applicant_ingress_v1.sql statement 20
EXECUTE $up_21a6a6dc980faef6c137541a$
revoke all on function public.career_applicant_status_v1(uuid,uuid) from public,anon,authenticated;$up_21a6a6dc980faef6c137541a$;
-- supabase/sql/proposals/career_applicant_ingress_v1.sql statement 21
EXECUTE $up_16f88aad33a1b1fce0c2db89$
grant execute on function public.career_applicant_status_v1(uuid,uuid) to service_role;$up_16f88aad33a1b1fce0c2db89$;
-- supabase/sql/proposals/career_application_conversation_v1.sql statement 1
EXECUTE $up_18357fc3c6cd69c90a9d62e2$-- SOURCE ONLY. After batch and applicant-ingress proposals. No external action.
-- Public source snapshots and explicit profile reviews reuse existing owner
-- account/epoch, career_host_commit and task/batch authority, never a second ledger.
create table public.career_application_searches_v1(
 user_id uuid not null references auth.users(id)on delete cascade,search_id uuid not null default gen_random_uuid(),
 thread_id uuid not null references agent_threads(id),request_key text not null,request_hash text not null,
 account_version bigint not null,privacy_epoch bigint not null,ask text not null,requested integer not null check(requested between 1 and 100),
 resume jsonb not null,results jsonb not null,source_health jsonb not null,role_interests jsonb not null,
 selected_batch uuid,selected_tasks jsonb,created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '5 minutes',
 primary key(user_id,search_id),unique(user_id,thread_id,request_key),
 foreign key(user_id,selected_batch)references career_application_batches_v1(user_id,batch_id)on delete cascade,
 check(jsonb_typeof(results)='array' and jsonb_array_length(results)<=200),check(octet_length(results::text)<=4194304)
);$up_18357fc3c6cd69c90a9d62e2$;
-- supabase/sql/proposals/career_application_conversation_v1.sql statement 2
EXECUTE $up_b83d798b15aaca95c8a3e305$
create table public.career_application_profile_reviews_v1(
 user_id uuid not null references auth.users(id)on delete cascade,thread_id uuid not null references agent_threads(id),
 request_key text not null,request_hash text not null,review_sha256 text not null,account_version bigint not null,privacy_epoch bigint not null,
 profile jsonb not null,fields jsonb not null,expires_at timestamptz not null default now()+interval '10 minutes',
 primary key(user_id,review_sha256),unique(user_id,thread_id,request_key),check(octet_length(profile::text)<=1048576)
);$up_b83d798b15aaca95c8a3e305$;
-- supabase/sql/proposals/career_application_conversation_v1.sql statement 3
EXECUTE $up_d0360b08e256ab605f7af913$
do $$declare n text;begin
 foreach n in array array['career_application_searches_v1','career_application_profile_reviews_v1']loop
  execute format('alter table public.%I enable row level security',n);
  execute format('revoke all on public.%I from public,anon,authenticated',n);
  execute format('grant select,insert,update,delete on public.%I to service_role',n);
  execute format('create policy backend_only on public.%I for all to service_role using(true)with check(true)',n);
 end loop;
end $$;$up_d0360b08e256ab605f7af913$;
-- supabase/sql/proposals/career_application_conversation_v1.sql statement 4
EXECUTE $up_1806dc0985327d3a269b72bc$
create function public.career_application_chat_context_v1(p_user uuid,p_thread uuid,p_key text,p_hash text)returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare loaded jsonb;resume jsonb;s career_application_searches_v1;a jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 if not exists(select 1 from agent_threads th where th.user_id=p_user and th.id=p_thread)then return jsonb_build_object('error','owned_thread_missing');end if;
 select value into a from career_watch_kv where user_id=p_user and key='career:account';
 if a->'paused'='true'::jsonb then return jsonb_build_object('error','application_context_revoked');end if;
 loaded:=career_host_load(p_user,p_thread,p_key,p_hash);if loaded?'error'then return loaded;end if;
 if loaded?'replay'then return jsonb_build_object('version','career_application_context/v1','loaded',loaded);end if;
 resume:=career_applicant_status_v1(p_user,p_thread);
 if resume?'error'and resume->>'error'<>'APPLICANT_STATUS_REVOKED'then return resume;end if;
 select * into s from career_application_searches_v1 where user_id=p_user and thread_id=p_thread and request_key=p_key;
 if s.search_id is not null and s.request_hash is distinct from p_hash then return jsonb_build_object('error','turn_key_conflict');end if;
 if s.search_id is not null and(s.account_version is distinct from (a->>'version')::bigint or s.privacy_epoch is distinct from coalesce((a->>'epoch')::bigint,0))then return jsonb_build_object('error','application_context_revoked');end if;
 return jsonb_build_object('version','career_application_context/v1','loaded',loaded,'resume',resume->'applicant','searchReplay',case when s.search_id is null then null else to_jsonb(s)end);
end $$;$up_1806dc0985327d3a269b72bc$;
-- supabase/sql/proposals/career_application_conversation_v1.sql statement 5
EXECUTE $up_161f2483fac3a6ffb4cf6089$
create function public.career_application_search_store_v1(p_user uuid,p_thread uuid,p_key text,p_hash text,p_version bigint,p_epoch bigint,p_ask text,p_limit integer,p_results jsonb,p_health jsonb,p_interests jsonb)returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare a jsonb;resume jsonb;s career_application_searches_v1;r jsonb;expected text;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select value into a from career_watch_kv where user_id=p_user and key='career:account';
 if a is null or a->'paused'='true'::jsonb or (a->>'version')::bigint is distinct from p_version or coalesce((a->>'epoch')::bigint,0)is distinct from p_epoch or not exists(select 1 from agent_threads th where th.user_id=p_user and th.id=p_thread)then return jsonb_build_object('error','application_context_revoked');end if;
 if coalesce(p_key,'')!~'^[A-Za-z0-9_-]{1,128}$'or coalesce(p_hash,'')!~'^[a-f0-9]{64}$'or p_ask is null or length(p_ask)>4000 or p_limit not between 1 and 100 or jsonb_typeof(p_results)is distinct from 'array'or jsonb_array_length(p_results)>least(200,p_limit*2)or (select count(distinct v->>'taskId')from jsonb_array_elements(p_results)v)<>jsonb_array_length(p_results)or jsonb_typeof(p_health)is distinct from 'array'or jsonb_typeof(p_interests)is distinct from 'array'then raise exception 'invalid application search';end if;
 select * into s from career_application_searches_v1 where user_id=p_user and thread_id=p_thread and request_key=p_key;
 if s.search_id is not null then if s.request_hash is distinct from p_hash then return jsonb_build_object('error','turn_key_conflict');end if;return to_jsonb(s);end if;
 resume:=career_applicant_status_v1(p_user,p_thread);if resume->>'status'is distinct from 'confirmed'then return jsonb_build_object('error','confirmed_resume_required');end if;
 for r in select *from jsonb_array_elements(p_results)loop
  expected:=substr(encode(sha256(convert_to(career_applicant_canonical_v1(jsonb_build_array(p_user::text,r#>>'{posting,canonicalKey}')),'UTF8')),'hex'),1,32);
  if r->>'taskId'is distinct from expected or r#>>'{posting,status}'is distinct from 'open'or coalesce(r#>>'{source,sha256}','')!~'^[a-f0-9]{64}$'or coalesce(r#>>'{source,provenance}','')not in('public_ats_snapshot/v1','synthetic_fixture/v1')or r#>>'{source,observedAt}'is null or (r#>>'{source,observedAt}')::timestamptz<clock_timestamp()-interval '5 minutes'or (r#>>'{source,observedAt}')::timestamptz>clock_timestamp()+interval '30 seconds'then raise exception 'invalid sourced application candidate';end if;
 end loop;
 insert into career_application_searches_v1(user_id,thread_id,request_key,request_hash,account_version,privacy_epoch,ask,requested,resume,results,source_health,role_interests)
 values(p_user,p_thread,p_key,p_hash,p_version,p_epoch,p_ask,p_limit,resume->'applicant',p_results,p_health,p_interests)returning *into s;return to_jsonb(s);
end $$;$up_161f2483fac3a6ffb4cf6089$;
-- supabase/sql/proposals/career_application_conversation_v1.sql statement 6
EXECUTE $up_3d9247fc5959fc452c3f3be4$
create function public.career_application_search_prepare_v1(p_user uuid,p_thread uuid,p_key text,p_search uuid,p_tasks jsonb)returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare a jsonb;s career_application_searches_v1;resume jsonb;r jsonb;t text;id text;event text;binding jsonb;request jsonb;result jsonb;old career_task_intents_v1;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select *into s from career_application_searches_v1 where user_id=p_user and search_id=p_search and thread_id=p_thread for update;
 select value into a from career_watch_kv where user_id=p_user and key='career:account';
 if s.search_id is null or a is null or a->'paused'='true'::jsonb or s.account_version is distinct from (a->>'version')::bigint or s.privacy_epoch is distinct from coalesce((a->>'epoch')::bigint,0)or not exists(select 1 from agent_threads th where th.user_id=p_user and th.id=p_thread)then raise exception 'application context revoked';end if;
 if jsonb_typeof(p_tasks)is distinct from 'array'or jsonb_array_length(p_tasks)not between 1 and 100 or (select count(distinct v)from jsonb_array_elements_text(p_tasks)v)<>jsonb_array_length(p_tasks)then raise exception 'invalid selected application tasks';end if;
 if s.selected_batch is not null then if s.selected_tasks is distinct from p_tasks then raise exception 'application selection conflict';end if;return career_application_batch_control_v1(p_user,p_thread,p_key,'status',jsonb_build_object('batchId',s.selected_batch));end if;
 if s.expires_at<=clock_timestamp()then raise exception 'application source snapshot expired';end if;
 resume:=career_applicant_status_v1(p_user,p_thread);if resume->>'status'is distinct from 'confirmed'or resume#>>'{applicant,artifactId}'is distinct from s.resume->>'artifactId'or resume#>>'{applicant,versionId}'is distinct from s.resume->>'versionId'or resume#>>'{applicant,sha256}'is distinct from s.resume->>'sha256'then raise exception 'application resume changed';end if;
 for t in select jsonb_array_elements_text(p_tasks)loop
  select v into r from jsonb_array_elements(s.results)v where v->>'taskId'=t;
  if r is null then raise exception 'owned selected application missing';end if;
  select anchor.*into old from career_task_intents_v1 anchor where anchor.user_id=p_user and anchor.task_id=t and anchor.privacy_epoch=s.privacy_epoch and anchor.binding->>'action'='prepare'and anchor.private_input->'posting'is not null order by anchor.created_at,anchor.intent_id limit 1;
  if old.intent_id is not null and(old.private_input->'posting'is distinct from r->'posting'or old.binding->>'resume_sha256'is distinct from s.resume->>'sha256')then raise exception 'application original preparation changed';end if;
  if old.intent_id is null then
   id:=encode(sha256(convert_to(career_applicant_canonical_v1(jsonb_build_array(p_user::text,p_search::text,t,'source')),'UTF8')),'hex');event:='discovery_'||substr(id,1,48);
   binding:=jsonb_build_object('version','career_task_intent/v1','intent_id',id,'user_id',p_user,'thread_id',p_thread,'turn_key',event,'request_hash',s.request_hash,'action','prepare','task_id',t,'event_id',event,'artifact_id',s.resume->>'artifactId','resume_sha256',s.resume->>'sha256','destination',r#>>'{posting,url}','authority_account_version',s.account_version,'privacy_epoch',s.privacy_epoch);
   request:=jsonb_build_object('eventId',event,'posting',r->'posting','artifactId',s.resume->>'artifactId','resumeSha256',s.resume->>'sha256');
   insert into career_task_intents_v1(user_id,intent_id,thread_id,turn_key,request_hash,event_hash,binding,private_input,authority_account_version,privacy_epoch,task_id,state,expires_at)
   values(p_user,id,p_thread,event,s.request_hash,id,binding,request,s.account_version,s.privacy_epoch,t,'completed',clock_timestamp()+interval '10 minutes');
  end if;
 end loop;
 result:=career_application_batch_control_v1(p_user,p_thread,p_key,'create',jsonb_build_object('taskIds',p_tasks));
 update career_application_searches_v1 set selected_batch=(result->>'batchId')::uuid,selected_tasks=p_tasks where user_id=p_user and search_id=p_search;
 return result;
end $$;$up_3d9247fc5959fc452c3f3be4$;
-- supabase/sql/proposals/career_application_conversation_v1.sql statement 7
EXECUTE $up_b34bd3f3a5876be3356328b8$
create function public.career_application_batch_lookup_v1(p_user uuid,p_thread uuid,p_review text default null,p_task text default null)returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare a jsonb;b career_application_batches_v1;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select value into a from career_watch_kv where user_id=p_user and key='career:account';
 if not exists(select 1 from agent_threads th where th.user_id=p_user and th.id=p_thread)or a is null or a->'paused'='true'::jsonb then raise exception 'application context revoked';end if;
 select *into b from career_application_batches_v1 x where x.user_id=p_user and x.thread_id=p_thread and x.account_version=(a->>'version')::bigint and x.privacy_epoch=coalesce((a->>'epoch')::bigint,0)
 and(p_review is null or exists(select 1 from career_application_batch_reviews_v1 r where r.user_id=p_user and r.batch_id=x.batch_id and r.review_sha256=p_review))
 and(p_task is null or exists(select 1 from career_application_batch_roles_v1 r where r.user_id=p_user and r.batch_id=x.batch_id and r.task_id=p_task))order by x.created_at desc,x.batch_id limit 1;
 return jsonb_build_object('batchId',b.batch_id);
end $$;$up_b34bd3f3a5876be3356328b8$;
-- supabase/sql/proposals/career_application_conversation_v1.sql statement 8
EXECUTE $up_cb394f319ddd66ed72cd2935$
create function public.career_application_task_context_v1(p_user uuid,p_intent text,p_lease uuid,p_task text)returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare a jsonb;i career_task_intents_v1;s career_application_searches_v1;r jsonb;profile jsonb;f jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select value into a from career_watch_kv where user_id=p_user and key='career:account';select *into i from career_task_intents_v1 where user_id=p_user and intent_id=p_intent;
 if a is null or a->'paused'='true'::jsonb or i.state is distinct from 'claimed'or i.task_id is distinct from p_task or i.lease_token is distinct from p_lease or i.expires_at<=clock_timestamp()or i.authority_account_version is distinct from (a->>'version')::bigint or i.privacy_epoch is distinct from coalesce((a->>'epoch')::bigint,0)or(i.claim_worker is not null and(i.claim_lease_until is null or i.claim_lease_until<=clock_timestamp()))or coalesce(i.binding->>'action','')not in('prepare','approve')then raise exception 'application task context revoked';end if;
 select *into s from career_application_searches_v1 where user_id=p_user and thread_id=i.thread_id and selected_batch=(i.private_input#>>'{batch,batchId}')::uuid and account_version=i.authority_account_version and privacy_epoch=i.privacy_epoch;
 if s.search_id is null then return jsonb_build_object('context',null);end if;
 perform career_application_batch_context_v1(p_user,i.thread_id,s.selected_batch);
 select v into r from jsonb_array_elements(coalesce(s.current_results,s.results))v where v->>'taskId'=p_task;
 select state->'career'into f from agent_flow_state where user_id=p_user and thread_id=i.thread_id;profile:=f#>'{stores,profile}';
 if r is null or profile is null or f#>>'{scope,userId}'is distinct from p_user::text or coalesce((f->>'privacy_epoch')::bigint,-1)is distinct from i.privacy_epoch then raise exception 'application profile context revoked';end if;
 return jsonb_build_object('context',jsonb_build_object('userId',p_user,'accountVersion',i.authority_account_version,'privacyEpoch',i.privacy_epoch,'taskId',p_task,'careerProfile',profile,'ask',s.ask,'roleInterests',s.role_interests,'currentPosting',jsonb_build_object('posting',r->'posting','observedAt',r#>>'{source,observedAt}','sourceSha256',r#>>'{source,sha256}')));
end $$;$up_cb394f319ddd66ed72cd2935$;
-- supabase/sql/proposals/career_application_conversation_v1.sql statement 9
EXECUTE $up_40de18f943b8f3a1f8ff48a0$
create function public.career_application_profile_review_v1(p_user uuid,p_thread uuid,p_key text,p_hash text,p_version bigint,p_epoch bigint,p_review text,p_profile jsonb,p_fields jsonb)returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare a jsonb;expected text;r career_application_profile_reviews_v1;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));select value into a from career_watch_kv where user_id=p_user and key='career:account';
 if a->'paused'='true'::jsonb or coalesce((a->>'version')::bigint,0)is distinct from p_version or coalesce((a->>'epoch')::bigint,0)is distinct from p_epoch or not exists(select 1 from agent_threads th where th.user_id=p_user and th.id=p_thread)then raise exception 'application context revoked';end if;
 select *into r from career_application_profile_reviews_v1 where user_id=p_user and thread_id=p_thread and request_key=p_key;
 if r.review_sha256 is not null then
  if r.request_hash is distinct from p_hash then raise exception 'application profile request conflict';end if;
  if r.account_version is distinct from p_version or r.privacy_epoch is distinct from p_epoch then raise exception 'application profile review changed';end if;
  return jsonb_build_object('reviewHash',r.review_sha256,'fields',r.fields,'expiresAt',r.expires_at);
 end if;
 expected:=encode(sha256(convert_to(career_applicant_canonical_v1(jsonb_build_object('userId',p_user,'threadId',p_thread,'requestKey',p_key,'accountVersion',p_version,'privacyEpoch',p_epoch,'profile',p_profile,'fields',p_fields)),'UTF8')),'hex');if expected is distinct from p_review then raise exception 'invalid application profile review';end if;
 insert into career_application_profile_reviews_v1(user_id,thread_id,request_key,request_hash,review_sha256,account_version,privacy_epoch,profile,fields)values(p_user,p_thread,p_key,p_hash,p_review,p_version,p_epoch,p_profile,p_fields)on conflict(user_id,review_sha256)do nothing;
 return jsonb_build_object('reviewHash',p_review,'fields',p_fields,'expiresAt',(select expires_at from career_application_profile_reviews_v1 where user_id=p_user and review_sha256=p_review));
end $$;$up_40de18f943b8f3a1f8ff48a0$;
-- supabase/sql/proposals/career_application_conversation_v1.sql statement 10
EXECUTE $up_3c0dff9f8ce9225b48f044c8$
create function public.career_application_profile_confirm_v1(p_base jsonb,p_review text,p_message text)returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare u uuid:=(p_base->>'p_user')::uuid;t uuid:=(p_base->>'p_thread')::uuid;r career_application_profile_reviews_v1;loaded jsonb;f jsonb;response jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));loaded:=career_host_load(u,t,p_base->>'p_key',p_base->>'p_hash');if loaded?'error'then return loaded;end if;if loaded?'replay'then return jsonb_build_object('response',loaded->'replay');end if;
 select *into r from career_application_profile_reviews_v1 where user_id=u and thread_id=t and review_sha256=p_review;
 if r.review_sha256 is null or r.expires_at<=clock_timestamp()or r.account_version is distinct from (loaded->>'accountVersion')::bigint or r.privacy_epoch is distinct from coalesce((loaded#>>'{account,epoch}')::bigint,0)or loaded#>'{account,paused}'='true'::jsonb or p_message is distinct from 'Confirm application facts '||p_review then raise exception 'application profile review changed';end if;
 f:=coalesce(nullif(loaded->'snapshot','null'::jsonb),jsonb_build_object('v',1,'scope',jsonb_build_object('userId',u),'stores','{}'::jsonb));f:=jsonb_set(f,'{stores,profile}',r.profile);
 response:=jsonb_build_object('thread_id',t,'turn_key',p_base->>'p_key','reply','Saved the application facts you explicitly confirmed. No application was submitted. Ask me to find your internship shortlist.','reminders','[]'::jsonb,'application',jsonb_build_object('version','career_application_chat/v1','status','profile_confirmed'));
 return career_host_commit(u,t,p_base->>'p_key',p_base->>'p_hash',(loaded->>'revision')::bigint,(loaded->>'accountVersion')::bigint,f,'{}'::jsonb,p_message,response);
end $$;$up_3c0dff9f8ce9225b48f044c8$;
-- supabase/sql/proposals/career_application_conversation_v1.sql statement 11
EXECUTE $up_63e919a77b98bf8266c815ee$
create function public.career_application_conversation_erase_v1()returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if coalesce(new.key,old.key)='career:account'and(tg_op='DELETE'or(tg_op='UPDATE'and coalesce((new.value->>'epoch')::bigint,0)is distinct from coalesce((old.value->>'epoch')::bigint,0)))then
  delete from career_application_search_scopes_v1 where user_id=coalesce(new.user_id,old.user_id);delete from career_application_scope_requests_v1 where user_id=coalesce(new.user_id,old.user_id);delete from career_application_searches_v1 where user_id=coalesce(new.user_id,old.user_id);delete from career_application_profile_reviews_v1 where user_id=coalesce(new.user_id,old.user_id);
 end if;return null;
end $$;$up_63e919a77b98bf8266c815ee$;
-- supabase/sql/proposals/career_application_conversation_v1.sql statement 12
EXECUTE $up_9dbf4ba233dd889e10e6178d$
create trigger career_application_conversation_erasure_v1 after update or delete on public.career_watch_kv for each row execute function career_application_conversation_erase_v1();$up_9dbf4ba233dd889e10e6178d$;
-- supabase/sql/proposals/career_application_conversation_v1.sql statement 13
EXECUTE $up_ba2ede9c8fa8c5dccf5f18ed$
revoke all on function career_application_chat_context_v1(uuid,uuid,text,text),career_application_search_store_v1(uuid,uuid,text,text,bigint,bigint,text,integer,jsonb,jsonb,jsonb),career_application_search_prepare_v1(uuid,uuid,text,uuid,jsonb),career_application_batch_lookup_v1(uuid,uuid,text,text),career_application_task_context_v1(uuid,text,uuid,text),career_application_profile_review_v1(uuid,uuid,text,text,bigint,bigint,text,jsonb,jsonb),career_application_profile_confirm_v1(jsonb,text,text),career_application_conversation_erase_v1()from public,anon,authenticated;$up_ba2ede9c8fa8c5dccf5f18ed$;
-- supabase/sql/proposals/career_application_conversation_v1.sql statement 14
EXECUTE $up_e48f2d61a5d2238a48349f93$
grant execute on function career_application_chat_context_v1(uuid,uuid,text,text),career_application_search_store_v1(uuid,uuid,text,text,bigint,bigint,text,integer,jsonb,jsonb,jsonb),career_application_search_prepare_v1(uuid,uuid,text,uuid,jsonb),career_application_batch_lookup_v1(uuid,uuid,text,text),career_application_task_context_v1(uuid,text,uuid,text),career_application_profile_review_v1(uuid,uuid,text,text,bigint,bigint,text,jsonb,jsonb),career_application_profile_confirm_v1(jsonb,text,text),career_application_conversation_erase_v1()to service_role;$up_e48f2d61a5d2238a48349f93$;
-- supabase/sql/proposals/career_application_conversation_v1.sql statement 15
EXECUTE $up_f79a924be3453a1a3e4e8bf8$

-- Query constraints have their own owner/thread scope; they are not applicant facts.
alter table career_application_searches_v1 add column current_results jsonb;$up_f79a924be3453a1a3e4e8bf8$;
-- supabase/sql/proposals/career_application_conversation_v1.sql statement 16
EXECUTE $up_0f638f3d2eeeebcc8677565b$
create table career_application_search_scopes_v1(user_id uuid not null references auth.users on delete cascade,thread_id uuid not null references agent_threads,account_version bigint not null,privacy_epoch bigint not null,interests jsonb not null,primary key(user_id,thread_id));$up_0f638f3d2eeeebcc8677565b$;
-- supabase/sql/proposals/career_application_conversation_v1.sql statement 17
EXECUTE $up_e14af76568d6154eee1ddeb6$
create table career_application_scope_requests_v1(user_id uuid not null references auth.users on delete cascade,thread_id uuid not null references agent_threads,request_key text not null,request_hash text not null,account_version bigint not null,privacy_epoch bigint not null,interests jsonb not null,primary key(user_id,thread_id,request_key));$up_e14af76568d6154eee1ddeb6$;
-- supabase/sql/proposals/career_application_conversation_v1.sql statement 18
EXECUTE $up_14810069fc2eabf8386e192e$
do $$declare n text;begin foreach n in array array['career_application_search_scopes_v1','career_application_scope_requests_v1']loop
 execute format('alter table %I enable row level security',n);execute format('revoke all on %I from public,anon,authenticated',n);execute format('grant select,insert,update,delete on %I to service_role',n);execute format('create policy backend_only on %I for all to service_role using(true)with check(true)',n);end loop;end $$;$up_14810069fc2eabf8386e192e$;
-- supabase/sql/proposals/career_application_conversation_v1.sql statement 19
EXECUTE $up_0a747669be6b56e4792c9ab0$
create function career_application_search_scope_v1(p_user uuid,p_thread uuid,p_key text,p_hash text,p_version bigint,p_epoch bigint,p_interests jsonb)returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare a jsonb;old career_application_search_scopes_v1;saved career_application_scope_requests_v1;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));select value into a from career_watch_kv where user_id=p_user and key='career:account';
 if not exists(select 1 from agent_threads where user_id=p_user and id=p_thread)or a->'paused'='true'::jsonb or coalesce((a->>'version')::bigint,0)is distinct from p_version or coalesce((a->>'epoch')::bigint,0)is distinct from p_epoch then raise exception 'application scope context revoked';end if;
 if coalesce(p_key,'')!~'^[A-Za-z0-9_-]{1,128}$'or coalesce(p_hash,'')!~'^[a-f0-9]{64}$'or jsonb_typeof(p_interests)is distinct from 'array'or octet_length(p_interests::text)>16384 then raise exception 'invalid application scope';end if;
 select *into old from career_application_search_scopes_v1 where user_id=p_user and thread_id=p_thread;
 select *into saved from career_application_scope_requests_v1 where user_id=p_user and thread_id=p_thread and request_key=p_key;
 if saved.request_key is not null then
  if saved.request_hash is distinct from p_hash then raise exception 'application search conflict';end if;
  if saved.account_version is distinct from p_version or saved.privacy_epoch is distinct from p_epoch or old.interests is distinct from saved.interests then raise exception 'application search scope changed';end if;
  return jsonb_build_object('interests',saved.interests);
 end if;
 insert into career_application_scope_requests_v1 values(p_user,p_thread,p_key,p_hash,p_version,p_epoch,p_interests);
 insert into career_application_search_scopes_v1 values(p_user,p_thread,p_version,p_epoch,p_interests)on conflict(user_id,thread_id)do update set account_version=excluded.account_version,privacy_epoch=excluded.privacy_epoch,interests=excluded.interests;
 if old.interests is distinct from p_interests then
  update career_task_intents_v1 i set state='cancelled'where i.user_id=p_user and i.thread_id=p_thread and i.state in('queued','claimed')and i.binding->>'action'in('prepare','approve')and exists(select 1 from career_application_searches_v1 x where x.user_id=p_user and x.thread_id=p_thread and x.selected_batch::text=i.private_input#>>'{batch,batchId}'and x.role_interests is distinct from p_interests);
  delete from career_application_batch_reviews_v1 r using career_application_batches_v1 b where b.user_id=p_user and b.thread_id=p_thread and r.user_id=b.user_id and r.batch_id=b.batch_id and r.approved_at is null;
 end if;
 return jsonb_build_object('interests',p_interests);
end $$;$up_0a747669be6b56e4792c9ab0$;
-- supabase/sql/proposals/career_application_conversation_v1.sql statement 20
EXECUTE $up_fbab12c23b2aa0ef48e72cf9$
create or replace function career_application_batch_context_v1(p_user uuid,p_thread uuid,p_batch uuid)returns career_application_batches_v1
language plpgsql security invoker set search_path=public,pg_temp as $$
declare b career_application_batches_v1;a jsonb;s career_application_searches_v1;q career_application_search_scopes_v1;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));select *into b from career_application_batches_v1 where user_id=p_user and batch_id=p_batch;select value into a from career_watch_kv where user_id=p_user and key='career:account';
 if b.batch_id is null or b.thread_id is distinct from p_thread or not exists(select 1 from agent_threads where user_id=p_user and id=p_thread)or a is null or a->'paused'='true'::jsonb or b.account_version is distinct from (a->>'version')::bigint or b.privacy_epoch is distinct from coalesce((a->>'epoch')::bigint,0)then raise exception 'batch context revoked';end if;
 select *into s from career_application_searches_v1 where user_id=p_user and selected_batch=p_batch;
 if s.search_id is not null then select *into q from career_application_search_scopes_v1 where user_id=p_user and thread_id=p_thread;if q.interests is distinct from s.role_interests or q.account_version is distinct from b.account_version or q.privacy_epoch is distinct from b.privacy_epoch then raise exception 'batch search scope changed';end if;end if;return b;
end $$;$up_fbab12c23b2aa0ef48e72cf9$;
-- supabase/sql/proposals/career_application_conversation_v1.sql statement 21
EXECUTE $up_4048b2194cdeafa087e8c242$
create function career_application_source_refresh_context_v1(p_user uuid,p_thread uuid,p_batch uuid,p_key text,p_hash text)returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare s career_application_searches_v1;c career_application_batch_commands_v1;
begin
 perform career_application_batch_context_v1(p_user,p_thread,p_batch);select *into s from career_application_searches_v1 where user_id=p_user and thread_id=p_thread and selected_batch=p_batch;
 if s.search_id is null then raise exception 'owned source snapshot missing';end if;
 select *into c from career_application_batch_commands_v1 where user_id=p_user and request_key=p_key;
 if c.request_key is not null then if c.request_hash is distinct from p_hash then raise exception 'source refresh conflict';end if;return jsonb_build_object('replay',c.response);end if;
 return jsonb_build_object('search',to_jsonb(s));
end $$;$up_4048b2194cdeafa087e8c242$;
-- supabase/sql/proposals/career_application_conversation_v1.sql statement 22
EXECUTE $up_37de75a7f44abe11dbd10b7f$
create function career_application_source_refresh_v1(p_user uuid,p_thread uuid,p_batch uuid,p_key text,p_hash text,p_results jsonb,p_health jsonb)returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare ctx jsonb;s career_application_searches_v1;r career_application_batch_roles_v1;prior jsonb;fresh jsonb;kept jsonb:='[]';result jsonb;i career_task_intents_v1;id text;event text;binding jsonb;
begin
 ctx:=career_application_source_refresh_context_v1(p_user,p_thread,p_batch,p_key,p_hash);if ctx?'replay'then return ctx->'replay';end if;s:=jsonb_populate_record(null::career_application_searches_v1,ctx->'search');
 if coalesce(p_key,'')!~'^[A-Za-z0-9_-]{1,128}$'or coalesce(p_hash,'')!~'^[a-f0-9]{64}$'or jsonb_typeof(p_results)is distinct from 'array'or jsonb_array_length(p_results)>100 or octet_length(p_results::text)>4194304 or jsonb_typeof(p_health)is distinct from 'array'then raise exception 'invalid source refresh';end if;
 for fresh in select *from jsonb_array_elements(p_results)loop if coalesce(fresh#>>'{source,sha256}','')!~'^[a-f0-9]{64}$'or coalesce(fresh#>>'{source,provenance}','')not in('public_ats_snapshot/v1','synthetic_fixture/v1')or fresh#>>'{source,observedAt}'is null or (fresh#>>'{source,observedAt}')::timestamptz<clock_timestamp()-interval '5 minutes'or(fresh#>>'{source,observedAt}')::timestamptz>clock_timestamp()+interval '30 seconds'then raise exception 'invalid refreshed observation';end if;end loop;
 for r in select *from career_application_batch_roles_v1 where user_id=p_user and batch_id=p_batch for update loop
  if exists(select 1 from career_task_effects_v1 where user_id=p_user and task_id=r.task_id and(operation='submit'or state in('reserved','started','uncertain')))then continue;end if;
  select v into prior from jsonb_array_elements(s.results)v where v->>'taskId'=r.task_id;select v into fresh from jsonb_array_elements(p_results)v where v->>'taskId'=r.task_id;
  update career_task_intents_v1 pending set state='cancelled'where pending.user_id=p_user and pending.task_id=r.task_id and pending.state in('queued','claimed')and pending.binding->>'action'in('prepare','approve');
  update career_application_batch_roles_v1 set answer_revision=answer_revision+1,answers='[]'where user_id=p_user and batch_id=p_batch and task_id=r.task_id;
  if fresh is not null and fresh->'posting'=prior->'posting'then kept:=kept||jsonb_build_array(fresh);perform career_application_batch_queue_v1(p_user,p_batch,r.task_id,'prepare');
  else
   select *into i from career_task_intents_v1 where user_id=p_user and intent_id=r.source_intent;id:=encode(sha256(convert_to(jsonb_build_array(p_user,p_batch,r.task_id,p_key,'source-held')::text,'UTF8')),'hex');event:='refresh_'||substr(id,1,48);binding:=i.binding||jsonb_build_object('intent_id',id,'turn_key',event,'event_id',event,'request_hash',p_hash);
   insert into career_task_intents_v1(user_id,intent_id,thread_id,turn_key,request_hash,event_hash,binding,private_input,authority_account_version,privacy_epoch,task_id,state,result,expires_at)
   values(p_user,id,p_thread,event,p_hash,id,binding,i.private_input,s.account_version,s.privacy_epoch,r.task_id,'completed',jsonb_build_object('status','blocked','blocker','SOURCE_CHANGED_OR_UNAVAILABLE_RESELECTION_REQUIRED','review',null,'asks','[]'::jsonb,'observedReplacement',fresh->'posting'),clock_timestamp()+interval '10 minutes');
   update career_application_batch_roles_v1 set last_intent=id where user_id=p_user and batch_id=p_batch and task_id=r.task_id;
  end if;
 end loop;
 update career_application_searches_v1 set current_results=kept,source_health=p_health where user_id=p_user and search_id=s.search_id;
 delete from career_application_batch_reviews_v1 where user_id=p_user and batch_id=p_batch and approved_at is null;
 result:=career_application_batch_control_v1(p_user,p_thread,p_key,'status',jsonb_build_object('batchId',p_batch));insert into career_application_batch_commands_v1 values(p_user,p_key,p_hash,s.privacy_epoch,result,now());return result;
end $$;$up_37de75a7f44abe11dbd10b7f$;
-- supabase/sql/proposals/career_application_conversation_v1.sql statement 23
EXECUTE $up_843731a74640c2707c2a101c$
revoke all on function career_application_search_scope_v1(uuid,uuid,text,text,bigint,bigint,jsonb),career_application_source_refresh_context_v1(uuid,uuid,uuid,text,text),career_application_source_refresh_v1(uuid,uuid,uuid,text,text,jsonb,jsonb)from public,anon,authenticated;$up_843731a74640c2707c2a101c$;
-- supabase/sql/proposals/career_application_conversation_v1.sql statement 24
EXECUTE $up_11e36e563ba8f227af24869d$
grant execute on function career_application_search_scope_v1(uuid,uuid,text,text,bigint,bigint,jsonb),career_application_source_refresh_context_v1(uuid,uuid,uuid,text,text),career_application_source_refresh_v1(uuid,uuid,uuid,text,text,jsonb,jsonb)to service_role;$up_11e36e563ba8f227af24869d$;
-- supabase/sql/proposals/career_application_conversation_v1.sql statement 25
EXECUTE $up_db89d398687724c9f0dcd93d$
create function career_application_approval_source_guard_v1()returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
declare s career_application_searches_v1;r jsonb;
begin
 if new.binding->>'action'='approve'and new.private_input#>>'{batch,batchId}'is not null then
  select *into s from career_application_searches_v1 where user_id=new.user_id and selected_batch=(new.private_input#>>'{batch,batchId}')::uuid;
  if s.search_id is not null then
   select v into r from jsonb_array_elements(coalesce(s.current_results,s.results))v where v->>'taskId'=new.task_id;
   if r is null or(r#>>'{source,observedAt}')::timestamptz<clock_timestamp()-interval '5 minutes'then raise exception 'application source observation expired; refresh and review required';end if;
  end if;
 end if;return new;
end $$;$up_db89d398687724c9f0dcd93d$;
-- supabase/sql/proposals/career_application_conversation_v1.sql statement 26
EXECUTE $up_b5e9b96cb6674c772ae4e61f$
revoke all on function career_application_approval_source_guard_v1()from public,anon,authenticated;$up_b5e9b96cb6674c772ae4e61f$;
-- supabase/sql/proposals/career_application_conversation_v1.sql statement 27
EXECUTE $up_d19223039f60f5bc9ccb0661$grant execute on function career_application_approval_source_guard_v1()to service_role;$up_d19223039f60f5bc9ccb0661$;
-- supabase/sql/proposals/career_application_conversation_v1.sql statement 28
EXECUTE $up_e971db4457da3e4cdd629369$
create trigger career_application_approval_source_guard_v1 before insert on career_task_intents_v1 for each row execute function career_application_approval_source_guard_v1();$up_e971db4457da3e4cdd629369$;
 PERFORM set_config('search_path','pg_catalog,public',true);
 select jsonb_build_object('version','career_forward_catalog/v1','serverMajor',current_setting('server_version_num')::integer/10000,
 'schemas',(select jsonb_agg(jsonb_build_object('name',n.nspname,'owner',pg_get_userbyid(n.nspowner),'aclSha',encode(sha256(convert_to(coalesce(n.nspacl::text,''),'UTF8')),'hex'))order by n.nspname)from pg_namespace n where n.nspname in('public','auth')),
 'defaultPrivileges',(select coalesce(jsonb_agg(jsonb_build_object('owner',pg_get_userbyid(d.defaclrole),'schema',coalesce(n.nspname,'GLOBAL'),'kind',d.defaclobjtype,'aclSha',encode(sha256(convert_to(d.defaclacl::text,'UTF8')),'hex'))order by pg_get_userbyid(d.defaclrole),coalesce(n.nspname,'GLOBAL'),d.defaclobjtype),'[]')from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace where d.defaclnamespace=0 or n.nspname in('public','auth')),
 'roles',(select jsonb_agg(jsonb_build_object('name',v.name,'exists',r.oid is not null,'bypassRLS',r.rolbypassrls)order by v.name)from(VALUES('service_role'),('anon'),('authenticated'))v(name)left join pg_roles r on r.rolname=v.name),
 'relations',(select jsonb_agg(jsonb_build_object('name',v.name,'exists',c.oid is not null,'kind',c.relkind,'persistence',c.relpersistence,'owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,
 'columns',(select coalesce(jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'notNull',a.attnotnull,'identity',a.attidentity,'generated',a.attgenerated,'columnAcl',(select coalesce(jsonb_agg(jsonb_build_object('grantee',case when ca.grantee=0 then 'PUBLIC'else pg_get_userbyid(ca.grantee)end,'privilege',ca.privilege_type,'grantable',ca.is_grantable)order by case when ca.grantee=0 then 'PUBLIC'else pg_get_userbyid(ca.grantee)end,ca.privilege_type),'[]')from aclexplode(a.attacl)ca),'defaultSha',encode(sha256(convert_to(coalesce(pg_get_expr(d.adbin,d.adrelid),''),'UTF8')),'hex'))order by a.attnum),'[]')from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),
 'constraints',(select coalesce(jsonb_agg(jsonb_build_object('name',k.conname,'kind',k.contype,'validated',k.convalidated,'definitionSha',encode(sha256(convert_to(pg_get_constraintdef(k.oid),'UTF8')),'hex'))order by k.conname),'[]')from pg_constraint k where k.conrelid=c.oid),
 'indexes',(select coalesce(jsonb_agg(jsonb_build_object('name',ic.relname,'valid',i.indisvalid,'ready',i.indisready,'unique',i.indisunique,'definitionSha',encode(sha256(convert_to(pg_get_indexdef(i.indexrelid),'UTF8')),'hex'))order by ic.relname),'[]')from pg_index i join pg_class ic on ic.oid=i.indexrelid where i.indrelid=c.oid),
 'policies',(select coalesce(jsonb_agg(jsonb_build_object('name',p.polname,'command',p.polcmd,'permissive',p.polpermissive,'schemas',(select jsonb_agg(jsonb_build_object('name',n.nspname,'owner',pg_get_userbyid(n.nspowner),'aclSha',encode(sha256(convert_to(coalesce(n.nspacl::text,''),'UTF8')),'hex'))order by n.nspname)from pg_namespace n where n.nspname in('public','auth')),
 'defaultPrivileges',(select coalesce(jsonb_agg(jsonb_build_object('owner',pg_get_userbyid(d.defaclrole),'schema',coalesce(n.nspname,'GLOBAL'),'kind',d.defaclobjtype,'aclSha',encode(sha256(convert_to(d.defaclacl::text,'UTF8')),'hex'))order by pg_get_userbyid(d.defaclrole),coalesce(n.nspname,'GLOBAL'),d.defaclobjtype),'[]')from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace where d.defaclnamespace=0 or n.nspname in('public','auth')),
 'roles',(select jsonb_agg(case when x=0 then 'PUBLIC' else pg_get_userbyid(x)end order by case when x=0 then 'PUBLIC'else pg_get_userbyid(x)end)from unnest(p.polroles)x),'usingSha',encode(sha256(convert_to(coalesce(pg_get_expr(p.polqual,p.polrelid),''),'UTF8')),'hex'),'checkSha',encode(sha256(convert_to(coalesce(pg_get_expr(p.polwithcheck,p.polrelid),''),'UTF8')),'hex'))order by p.polname),'[]')from pg_policy p where p.polrelid=c.oid),
 'triggers',(select coalesce(jsonb_agg(jsonb_build_object('name',t.tgname,'enabled',t.tgenabled,'definitionSha',encode(sha256(convert_to(pg_get_triggerdef(t.oid),'UTF8')),'hex'))order by t.tgname),'[]')from pg_trigger t where t.tgrelid=c.oid and not t.tgisinternal),'acl',(select coalesce(jsonb_agg(jsonb_build_object('grantee',case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,'privilege',a.privilege_type,'grantable',a.is_grantable)order by case when a.grantee=0 then 'PUBLIC'else pg_get_userbyid(a.grantee)end,a.privilege_type),'[]')from aclexplode(coalesce(c.relacl,acldefault('r',c.relowner)))a))order by v.name)from unnest(ARRAY['agent_model_calls','career_applicant_resumes_v1','career_applicant_uploads_v1','career_application_admissions_v1','career_application_batch_commands_v1','career_application_batch_reviews_v1','career_application_batch_roles_v1','career_application_batches_v1','career_application_profile_reviews_v1','career_application_scope_requests_v1','career_application_search_scopes_v1','career_application_searches_v1','career_model_campaign_v1','career_model_pair_legs_v2','career_model_pair_policy_v2','career_model_pairs_v2','career_model_reservations_v1','career_reminder_outbox','career_task_effects_v1','career_task_intents_v1','career_watch_kv']::text[])v(name)left join pg_class c on c.oid=to_regclass('public.'||v.name)),
 'functions',(select jsonb_agg(jsonb_build_object('name',v.name,'overloads',(select coalesce(jsonb_agg(jsonb_build_object('arguments',pg_get_function_identity_arguments(p.oid),'returns',pg_get_function_result(p.oid),'owner',pg_get_userbyid(p.proowner),'language',(select lanname from pg_language where oid=p.prolang),'securityDefiner',p.prosecdef,'volatility',p.provolatile,'parallel',p.proparallel,'strict',p.proisstrict,'definitionSha',encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'),'bodySha',encode(sha256(convert_to(p.prosrc,'UTF8')),'hex'),'configSha',encode(sha256(convert_to(coalesce(p.proconfig::text,''),'UTF8')),'hex'),'defaultsSha',encode(sha256(convert_to(coalesce(pg_get_expr(p.proargdefaults,0),''),'UTF8')),'hex'),'acl',(select coalesce(jsonb_agg(jsonb_build_object('grantee',case when a.grantee=0 then 'PUBLIC'else pg_get_userbyid(a.grantee)end,'privilege',a.privilege_type,'grantable',a.is_grantable)order by case when a.grantee=0 then 'PUBLIC'else pg_get_userbyid(a.grantee)end,a.privilege_type),'[]')from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))a))order by pg_get_function_identity_arguments(p.oid)),'[]')from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'and p.proname=v.name and p.prokind='f'))order by v.name)from unnest(ARRAY['agent_model_call_record','agent_model_call_reserve','career_applicant_canonical_v1','career_applicant_confirm_turn_v1','career_applicant_equipment_resolve_base_v1','career_applicant_equipment_resolve_v1','career_applicant_resume_confirm_v1','career_applicant_resume_erase_v1','career_applicant_review_v1','career_applicant_status_v1','career_applicant_turn_version_v1','career_applicant_upload_erase_v1','career_applicant_upload_sweep_v1','career_applicant_upload_turn_v1','career_application_admission_history_v1','career_application_admit_v1','career_application_approval_source_guard_v1','career_application_batch_answers_v1','career_application_batch_context_v1','career_application_batch_control_v1','career_application_batch_erase_v1','career_application_batch_lookup_v1','career_application_batch_progress_v1','career_application_batch_queue_v1','career_application_chat_context_v1','career_application_conversation_erase_v1','career_application_profile_confirm_v1','career_application_profile_review_v1','career_application_search_prepare_v1','career_application_search_scope_v1','career_application_search_store_v1','career_application_source_refresh_context_v1','career_application_source_refresh_v1','career_application_task_context_v1','career_host_commit','career_host_load','career_journey_action_claim_v1','career_journey_action_read_v1','career_journey_artifact_open_v1','career_journey_artifact_scope_v1','career_journey_checker_prepare_v1','career_journey_context_basis_v1','career_journey_context_commit_v1','career_journey_context_content_v1','career_journey_context_cursor_v1','career_journey_context_load_v2','career_journey_context_read_v1','career_journey_context_refresh_commit_v1','career_journey_context_refresh_load_v1','career_journey_execution_fence_v1','career_journey_leg_consume_v1','career_journey_observe_v1','career_journey_outcome_record_v1','career_journey_readback_v1','career_journey_turn_commit_v1','career_model_budget_consume_v1','career_model_budget_reserve_v1','career_model_budget_settle_v1','career_model_context_barrier_v2','career_model_context_current_v1','career_model_context_read_v2','career_model_leg_consume_v2','career_model_leg_settle_v2','career_model_pair_read_v2','career_model_pair_reserve_v2','career_model_replay_check_v2','career_native_checker_prepare_v1','career_native_claim_v1','career_native_fence_v1','career_native_leg_consume_v1','career_native_observe_v1','career_native_outcome_v1','career_native_read_v1','career_native_replay_v1','career_native_turn_commit_v1','career_reminder_ack','career_reminder_allowed','career_reminder_claim','career_reminder_enqueue','career_reminder_list','career_reminder_status','career_task_account_v1','career_task_begin_effect_v1','career_task_claim_owned_v1','career_task_claim_readback_v1','career_task_claim_v1','career_task_consume_effect_v1','career_task_control_hook_v1','career_task_effect_status_v1','career_task_finish_v1','career_task_owned_grant_v1','career_task_owned_lease_fence_v1','career_task_pending_owned_v1','career_task_pending_scoped_v1','career_task_pending_v1','career_task_result_v1','career_task_settle_effect_v1','career_task_turn_commit_v1','career_watch_cycle_commit','career_watch_read','career_watch_write']::text[])v(name)),
 'dependencies',(select jsonb_agg(jsonb_build_object('name',e.key,'columns',(select coalesce(jsonb_agg(jsonb_build_object('name',v.name,'exists',a.attnum is not null,'type',format_type(a.atttypid,a.atttypmod),'notNull',a.attnotnull)order by v.name),'[]')from jsonb_array_elements_text(e.value)v(name)left join pg_attribute a on a.attrelid=to_regclass(e.key)and a.attname=v.name and a.attnum>0 and not a.attisdropped))order by e.key)from jsonb_each('{"auth.users":["id"],"public.profiles":["id"],"public.agent_threads":["id","user_id"],"public.agent_flow_state":["thread_id","user_id","state","updated_at"],"public.agent_messages":["id","thread_id","role","content","meta","created_at"],"public.agent_usage":["id","user_id","thread_id","model","call_id","input_tokens","output_tokens","cache_read_tokens","cache_write_tokens","created_at"]}'::jsonb)e)) INTO observed;
 CREATE TABLE public.career_forward_upgrade_v1(migration_id text primary key,plan_sha256 text not null,baseline_catalog_sha256 text not null,installed_catalog_sha256 text not null,completed_at timestamptz not null default clock_timestamp());
 ALTER TABLE public.career_forward_upgrade_v1 ENABLE ROW LEVEL SECURITY;
 REVOKE ALL ON public.career_forward_upgrade_v1 FROM public,anon,authenticated,service_role;
 GRANT SELECT ON public.career_forward_upgrade_v1 TO service_role;
 CREATE POLICY backend_read_only ON public.career_forward_upgrade_v1 FOR SELECT TO service_role USING(true);
 INSERT INTO public.career_forward_upgrade_v1(migration_id,plan_sha256,baseline_catalog_sha256,installed_catalog_sha256)VALUES('career-forward-upgrade/v1','065cc33333d3f1369a562d28fe61c769d0d75636b00b6851a22d3400d09cb6d3',encode(sha256(convert_to(expected::text,'UTF8')),'hex'),encode(sha256(convert_to(observed::text,'UTF8')),'hex'));
 RAISE NOTICE 'UPGRADE_APPLIED_NO_ALLOWANCE_OR_MODEL_POLICY_SEEDED';
END $forward$;
COMMIT;

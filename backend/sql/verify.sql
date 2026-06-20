select extname from pg_extension where extname = 'vector';
select indexdef from pg_indexes where indexname = 'chunks_embedding_idx';
select proname from pg_proc where proname = 'match_chunks';

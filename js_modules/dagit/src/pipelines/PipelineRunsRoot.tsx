import {gql, NetworkStatus} from '@apollo/client';
import {NonIdealState} from '@blueprintjs/core';
import {IconNames} from '@blueprintjs/icons';
import * as React from 'react';
import styled from 'styled-components/macro';

import {useDocumentTitle} from 'src/hooks/useDocumentTitle';
import {explorerPathFromString} from 'src/pipelines/PipelinePathUtils';
import {
  PipelineRunsRootQuery,
  PipelineRunsRootQueryVariables,
} from 'src/pipelines/types/PipelineRunsRootQuery';
import {RunTable, RUN_TABLE_RUN_FRAGMENT} from 'src/runs/RunTable';
import {RunsQueryRefetchContext} from 'src/runs/RunUtils';
import {
  RunFilterTokenType,
  RunsFilter,
  runsFilterForSearchTokens,
  useQueryPersistedRunFilters,
} from 'src/runs/RunsFilter';
import {POLL_INTERVAL, useCursorPaginatedQuery} from 'src/runs/useCursorPaginatedQuery';
import {Box} from 'src/ui/Box';
import {useCountdown} from 'src/ui/Countdown';
import {CursorPaginationControls} from 'src/ui/CursorControls';
import {ScrollContainer} from 'src/ui/ListComponents';
import {Loading} from 'src/ui/Loading';
import {Page} from 'src/ui/Page';
import {RefreshableCountdown} from 'src/ui/RefreshableCountdown';

const PAGE_SIZE = 25;
const ENABLED_FILTERS: RunFilterTokenType[] = ['id', 'snapshotId', 'status', 'tag'];

interface Props {
  pipelinePath: string;
}

export const PipelineRunsRoot: React.FC<Props> = (props) => {
  const {pipelinePath} = props;
  const {pipelineName, snapshotId} = explorerPathFromString(pipelinePath);

  useDocumentTitle(`Pipeline: ${pipelineName}`);
  const [filterTokens, setFilterTokens] = useQueryPersistedRunFilters(ENABLED_FILTERS);

  const {queryResult, paginationProps} = useCursorPaginatedQuery<
    PipelineRunsRootQuery,
    PipelineRunsRootQueryVariables
  >({
    query: PIPELINE_RUNS_ROOT_QUERY,
    pageSize: PAGE_SIZE,
    variables: {
      filter: {...runsFilterForSearchTokens(filterTokens), pipelineName, snapshotId},
    },
    nextCursorForResult: (runs) => {
      if (runs.pipelineRunsOrError.__typename !== 'PipelineRuns') {
        return undefined;
      }
      return runs.pipelineRunsOrError.results[PAGE_SIZE]?.runId;
    },
    getResultArray: (data) => {
      if (!data || data.pipelineRunsOrError.__typename !== 'PipelineRuns') {
        return [];
      }
      return data.pipelineRunsOrError.results;
    },
  });

  const countdownStatus = queryResult.networkStatus === NetworkStatus.ready ? 'counting' : 'idle';
  const timeRemaining = useCountdown({
    duration: POLL_INTERVAL,
    status: countdownStatus,
  });
  const countdownRefreshing = countdownStatus === 'idle' || timeRemaining === 0;

  const tokens = [{token: 'pipeline', value: pipelineName}, ...filterTokens];
  if (snapshotId) {
    tokens.push({token: 'snapshotId', value: snapshotId});
  }

  return (
    <RunsQueryRefetchContext.Provider value={{refetch: queryResult.refetch}}>
      <ScrollContainer>
        <Page>
          <Box flex={{alignItems: 'flex-start', justifyContent: 'space-between'}}>
            <Filters>
              <RunsFilter
                enabledFilters={ENABLED_FILTERS}
                tokens={tokens}
                onChange={setFilterTokens}
                loading={queryResult.loading}
              />
            </Filters>
            <RefreshableCountdown
              refreshing={countdownRefreshing}
              seconds={Math.floor(timeRemaining / 1000)}
              onRefresh={() => queryResult.refetch()}
            />
          </Box>

          <Loading queryResult={queryResult} allowStaleData={true}>
            {({pipelineRunsOrError}) => {
              if (pipelineRunsOrError.__typename !== 'PipelineRuns') {
                return (
                  <NonIdealState
                    icon={IconNames.ERROR}
                    title="Query Error"
                    description={pipelineRunsOrError.message}
                  />
                );
              }
              const runs = pipelineRunsOrError.results;
              const displayed = runs.slice(0, PAGE_SIZE);
              const {hasNextCursor, hasPrevCursor} = paginationProps;
              return (
                <>
                  <RunTable runs={displayed} onSetFilter={setFilterTokens} />
                  {hasNextCursor || hasPrevCursor ? (
                    <div style={{marginTop: '20px'}}>
                      <CursorPaginationControls {...paginationProps} />
                    </div>
                  ) : null}
                </>
              );
            }}
          </Loading>
        </Page>
      </ScrollContainer>
    </RunsQueryRefetchContext.Provider>
  );
};

const Filters = styled.div`
  display: flex;
  align-items: center;
  margin-bottom: 14px;
`;

const PIPELINE_RUNS_ROOT_QUERY = gql`
  query PipelineRunsRootQuery($limit: Int, $cursor: String, $filter: PipelineRunsFilter!) {
    pipelineRunsOrError(limit: $limit, cursor: $cursor, filter: $filter) {
      ... on PipelineRuns {
        results {
          id
          ...RunTableRunFragment
        }
      }
      ... on InvalidPipelineRunsFilterError {
        message
      }
      ... on PythonError {
        message
      }
    }
  }

  ${RUN_TABLE_RUN_FRAGMENT}
`;

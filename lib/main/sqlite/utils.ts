import { getDb } from './db'

export const run = (query: string, params: any[] = []): Promise<void> =>
  new Promise((resolve, reject) => {
    getDb().run(query, params, function (err) {
      if (err) return reject(err)
      resolve()
    })
  })

export const exec = (query: string): Promise<void> =>
  new Promise((resolve, reject) => {
    getDb().exec(query, function (err) {
      if (err) return reject(err)
      resolve()
    })
  })

export const get = <T>(
  query: string,
  params: any[] = [],
): Promise<T | undefined> =>
  new Promise((resolve, reject) => {
    getDb().get(query, params, (err, row: T) => {
      if (err) return reject(err)
      resolve(row)
    })
  })

export const all = <T>(query: string, params: any[] = []): Promise<T[]> =>
  new Promise((resolve, reject) => {
    getDb().all(query, params, (err, rows: T[]) => {
      if (err) return reject(err)
      resolve(rows)
    })
  })
